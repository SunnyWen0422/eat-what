"""Read MySQL dump inside ZIP without extracting or executing SQL.

Only schema and aggregate results are emitted. User/private rows remain transient
in process memory. Unsupported data-bearing syntax fails closed. No network.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import stat
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath

PARSER_CHECKS = Counter()


class UnsupportedSQL(Exception):
    pass


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''): h.update(b)
    return h.hexdigest()


def normalized(value):
    return '' if value is None else str(value).strip()


def statement_stream(lines):
    """Yield statements with SQL quotes/comments recognized, not split on text ;."""
    buf, quote, escaped, block, comment = [], None, False, False, []
    start, line_no = None, 0
    for line_no, line in enumerate(lines, 1):
        i = 0
        while i < len(line):
            c, n = line[i], line[i+1:i+2]
            if block:
                if c == '*' and n == '/':
                    if comment and comment[0] == '!':
                        executable = re.sub(r'^!\d*\s*', '', ''.join(comment)).strip()
                        if not re.match(r'^(?:SET|ALTER TABLE)\b', executable, re.I):
                            raise UnsupportedSQL('unsupported executable comment')
                        if executable.upper().startswith('ALTER') and not re.fullmatch(r'ALTER TABLE\s+`[^`]+`\s+(?:DISABLE|ENABLE) KEYS\s*',executable,re.I):
                            raise UnsupportedSQL('schema-changing executable comment is unsupported')
                        if re.search(r'NO_BACKSLASH_ESCAPES|ANSI_QUOTES', executable, re.I):
                            raise UnsupportedSQL('unsupported string escape SQL mode')
                        PARSER_CHECKS['executableCommentsValidated'] += 1
                    block = False; comment = []; i += 2
                else: comment.append(c); i += 1
                continue
            if quote:
                buf.append(c)
                if escaped: escaped = False
                elif c == '\\' and quote != '`': escaped = True
                elif c == quote:
                    if n == quote: buf.append(n); i += 1
                    else: quote = None
                i += 1
                continue
            if c == '/' and n == '*': block = True; i += 2; continue
            if c == '#' or (c == '-' and n == '-' and (i+2 == len(line) or line[i+2].isspace())): break
            if c == ';':
                sql = ''.join(buf).strip()
                if sql: yield start or line_no, sql
                buf, start = [], None
            else:
                if c in "'\"`": quote = c
                if start is None and not c.isspace(): start = line_no
                buf.append(c)
            i += 1
        if len(buf) > 32000000: raise UnsupportedSQL('statement exceeds parser limit')
    if quote or block: raise UnsupportedSQL('unterminated SQL quote/comment')
    if ''.join(buf).strip(): raise UnsupportedSQL('nonterminated final statement')


def split_top(text):
    out, start, depth, quote, escape, i = [], 0, 0, None, False, 0
    while i < len(text):
        c = text[i]
        if quote:
            if escape: escape = False
            elif c == '\\' and quote != '`': escape = True
            elif c == quote:
                if i+1 < len(text) and text[i+1] == quote: i += 1
                else: quote = None
        elif c in "'\"`": quote = c
        elif c == '(': depth += 1
        elif c == ')': depth -= 1
        elif c == ',' and depth == 0: out.append(text[start:i].strip()); start = i+1
        if depth < 0: raise UnsupportedSQL('unbalanced expression')
        i += 1
    if quote or depth != 0: raise UnsupportedSQL('unbalanced expression')
    out.append(text[start:].strip())
    return out


def value(token):
    token = token.strip()
    if token.upper() == 'NULL': return None
    if re.fullmatch(r'[-+]?\d+', token): return int(token)
    if re.fullmatch(r'[-+]?(?:\d+\.\d*|\d*\.\d+|\d+)(?:[Ee][-+]?\d+)?', token): return Decimal(token)
    if re.fullmatch(r'0x[0-9A-Fa-f]*', token): return bytes.fromhex(token[2:])
    if re.fullmatch(r"[bB]'[01]+'", token): return int(token[2:-1], 2)
    token = re.sub(r'^_(?:binary|utf8mb4|utf8)\s*', '', token, flags=re.I)
    if len(token) >= 2 and token[0] in "'\"" and token[-1] == token[0]:
        quote, raw, out, i = token[0], token[1:-1], [], 0
        escapes = {'0':'\0','n':'\n','r':'\r','t':'\t','b':'\b','Z':'\x1a'}
        while i < len(raw):
            c = raw[i]
            if c == '\\':
                if i+1 >= len(raw): raise UnsupportedSQL('trailing string escape')
                i += 1; out.append('\\'+raw[i] if raw[i] in '%_' else escapes.get(raw[i], raw[i]))
            elif c == quote:
                if i+1 < len(raw) and raw[i+1] == quote: out.append(c); i += 1
                else: raise UnsupportedSQL('unescaped internal string quote')
            else: out.append(c)
            i += 1
        return ''.join(out)
    raise UnsupportedSQL('unsupported SQL value expression')


def schema(sql):
    m = re.match(r'^CREATE TABLE(?: IF NOT EXISTS)?\s+`([^`]+)`\s*\((.*)\)\s*(?:ENGINE|TYPE)\b', sql, re.I | re.S)
    if not m: raise UnsupportedSQL('unsupported CREATE TABLE syntax')
    name, parts = m.group(1).lower(), split_top(m.group(2))
    cols, pk, indexes = [], [], []
    for part in parts:
        col = re.match(r'^`([^`]+)`\s+([A-Za-z]+(?:\([^)]*\))?)', part)
        if col: cols.append({'name': col.group(1).lower(), 'type': col.group(2), 'nullable': not bool(re.search(r'\bNOT NULL\b',part,re.I))})
        elif part.upper().startswith('PRIMARY KEY'): pk = re.findall(r'`([^`]+)`', part)
        elif re.match(r'^(?:UNIQUE |FULLTEXT |SPATIAL )?(?:KEY|INDEX)\b', part,re.I):
            names = re.findall(r'`([^`]+)`', part)
            indexes.append({'name': names[0] if names else '', 'columns': [x.lower() for x in names[1:]], 'unique': part.upper().startswith('UNIQUE')})
        elif not re.match(r'^(?:CONSTRAINT|CHECK|FOREIGN KEY)\b', part,re.I): raise UnsupportedSQL('unsupported table component')
    if not cols: raise UnsupportedSQL('table without parsed columns')
    return name, {'columns': cols, 'primaryKey': [x.lower() for x in pk], 'indexes': indexes}


def inserted(sql, schemas):
    m = re.match(r'^INSERT\s+INTO\s+`([^`]+)`\s*(\([^)]*\))?\s+VALUES\s*(.*)$', sql, re.I | re.S)
    if not m: raise UnsupportedSQL('unsupported INSERT syntax')
    table, explicit, body = m.group(1).lower(), m.group(2), m.group(3)
    if table not in schemas: raise UnsupportedSQL('insert table lacks parsed schema')
    cols = [x.lower() for x in re.findall(r'`([^`]+)`',explicit)] if explicit else [x['name'] for x in schemas[table]['columns']]
    if not cols or len(cols) != len(set(cols)): raise UnsupportedSQL('invalid insert column list')
    if set(cols) != {x['name'] for x in schemas[table]['columns']}:
        raise UnsupportedSQL('partial or unknown INSERT columns are not supported')
    for row in split_top(body):
        if not (row.startswith('(') and row.endswith(')')): raise UnsupportedSQL('unsupported insert row')
        vals = [value(token) for token in split_top(row[1:-1])]
        if len(vals) != len(cols): raise UnsupportedSQL('insert value count differs from columns')
        yield table, dict(zip(cols, vals))


def key_check(rows, columns):
    # An absent key imposes no uniqueness constraint (history tables may repeat).
    if not columns:
        return {'inspectedRows':0,'skippedNullRows':0,'groups':0,'rowsInGroups':0,'extraRows':0}
    columns=[c.lower() for c in columns]
    eligible=[tuple(row.get(c) for c in columns) for row in rows if all(row.get(c) is not None for c in columns)]
    repeated=[n for n in Counter(eligible).values() if n>1]
    return {'inspectedRows':len(eligible),'skippedNullRows':len(rows)-len(eligible),
            'groups':len(repeated),'rowsInGroups':sum(repeated),'extraRows':sum(n-1 for n in repeated)}


KNOWN_DUMP_SHA = '7f84fb788eb12700a74c0a9f886c794191116e830ac9db58b2d95cb848cd2f86'
def read_dump(path):
    path=Path(path);before=sha(path)
    if before!=KNOWN_DUMP_SHA:raise UnsupportedSQL('Backup differs from the audited baseline; audit it before restoration')
    schemas={};records=defaultdict(list);ddl={}
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist())!=1:raise UnsupportedSQL('Expected one reviewed SQL member')
        item=archive.infolist()[0];name=PurePosixPath(item.filename.replace('\\','/'))
        if name.is_absolute() or '..' in name.parts or ':' in item.filename or item.flag_bits&1 or stat.S_ISLNK(item.external_attr>>16) or item.file_size>100000000:
            raise UnsupportedSQL('Unsafe archive member')
        with archive.open(item) as binary,io.TextIOWrapper(binary,encoding='utf-8-sig',errors='strict') as stream:
            for _,sql in statement_stream(stream):
                kind=sql.split(None,1)[0].upper()
                if kind=='CREATE':
                    table,definition=schema(sql)
                    if table in schemas or re.search(r'\b(?:DATA DIRECTORY|INDEX DIRECTORY|TABLESPACE|GENERATED|SELECT)\b',sql,re.I):raise UnsupportedSQL('Unreviewed DDL')
                    schemas[table]=definition;ddl[table]=sql
                elif kind=='INSERT':
                    for table,row in inserted(sql,schemas):records[table].append(row)
                elif kind not in ['DROP','LOCK','UNLOCK','SET']:raise UnsupportedSQL('Unsupported backup statement')
    if sha(path)!=before:raise UnsupportedSQL('Source changed during parsing')
    for table,definition in schemas.items():
        primary=definition['primaryKey']
        if primary and key_check(records[table],primary)['groups']:
            raise UnsupportedSQL('Duplicate source primary key: '+table)
        for index in definition['indexes']:
            if index['unique'] and key_check(records[table],index['columns'])['groups']:
                raise UnsupportedSQL('Duplicate source unique key: '+table+'.'+index['name'])
    return {'schemas':schemas,'records':records,'ddl':ddl,'sourceSha256':before}
