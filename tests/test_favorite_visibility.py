"""Execute the production favorite SQL against an isolated relational fixture.

SQLite adapters cover only NOW and MySQL's duplicate clause. This deliberately
does not claim MySQL/MyBatis integration coverage; the visibility predicates and
joins are extracted unchanged from the production mapper on every run.
"""
import json
from pathlib import Path
import re
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]


def mapper_sql(method, annotation):
    source = (ROOT / 'backend/src/main/java/com/eatwhat/mapper/FavoriteDishMapper.java').read_text()
    constants = {}
    for name, expression in re.findall(r'String\s+(\w+)\s*=\s*(.*?);', source, re.S):
        constants[name] = ''.join(json.loads(value) for value in re.findall(r'"(?:\\.|[^"\\])*"', expression))
    end = source.index(' ' + method + '(')
    start = source.rfind('@' + annotation + '(', 0, end) + len(annotation) + 2
    tail = source[start:end].split('@Options')[0].split('@Results')[0]
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|\b[A-Z][A-Z_]+\b', tail)
    sql = ''.join(json.loads(token) if token.startswith('"') else constants[token] for token in tokens)
    sql = sql.replace('NOW()', 'CURRENT_TIMESTAMP')
    sql = re.sub(r'#\{(\w+)\}', r':\1', sql)
    if 'ON DUPLICATE KEY' in sql:
        sql = sql.split('ON DUPLICATE KEY')[0] + ' ON CONFLICT(USER_ID,DISH_ID) DO NOTHING'
    return sql


class FavoriteVisibilityTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE food(id INTEGER PRIMARY KEY,name TEXT,type TEXT,cl TEXT,fl TEXT,
              step TEXT,tags TEXT,image TEXT,difficulty TEXT,cook_time TEXT,
              ingredients_amounts TEXT,steps TEXT,step_images TEXT,tips TEXT,
              methods TEXT,kcal INTEGER,user_id INTEGER,is_published INTEGER);
            CREATE TABLE favorite_dishes(id INTEGER PRIMARY KEY,user_id INTEGER,
              dish_id INTEGER,create_time TEXT,UNIQUE(user_id,dish_id));
        ''')
        self.db.executemany('INSERT INTO food(id,name,user_id,is_published,steps) VALUES(?,?,?,?,?)', [
            (1, 'public', None, 1, 'public-steps'),
            (2, 'legacy-public', None, None, 'legacy-steps'),
            (3, 'mine', 11, 0, 'my-steps'),
            (4, 'foreign', 22, 1, 'private-steps'),
            (5, 'hidden-public', None, 0, 'unpublished-steps'),
        ])

    def add(self, dish_id, user_id=11):
        return self.db.execute(mapper_sql('insert', 'Insert'), {'userId': user_id, 'dishId': dish_id})

    def read(self, method, dish_id=1, user_id=11):
        return self.db.execute(mapper_sql(method, 'Select'), {'userId': user_id, 'dishId': dish_id}).fetchall()

    def test_atomic_add_allows_public_legacy_and_own_private(self):
        for dish_id in (1, 2, 3):
            self.add(dish_id)
        self.assertEqual({1, 2, 3}, {row[0] for row in self.read('selectDishIdsByUser')})

    def test_atomic_add_rejects_foreign_private_hidden_and_missing(self):
        for dish_id in (4, 5, 999):
            with self.subTest(dish_id=dish_id):
                self.add(dish_id)
                self.assertEqual(0, self.db.execute('SELECT COUNT(*) FROM favorite_dishes WHERE dish_id=?', (dish_id,)).fetchone()[0])

    def test_old_inaccessible_rows_never_escape_any_read(self):
        for dish_id in (1, 2, 3, 4, 5, 999):
            self.db.execute('INSERT INTO favorite_dishes(user_id,dish_id) VALUES(11,?)', (dish_id,))
        self.assertEqual({1, 2, 3}, {row[0] for row in self.read('selectDishIdsByUser')})
        self.assertEqual({1, 2, 3}, {row[0] for row in self.read('selectFavoritesByUser')})
        for dish_id in (4, 5, 999):
            self.assertEqual([(0,)], self.read('isFavorite', dish_id))

    def test_delete_unpublish_and_owner_change_hide_existing_rows(self):
        for dish_id in (1, 2, 3):
            self.add(dish_id)
        self.db.execute('DELETE FROM food WHERE id=1')
        self.db.execute('UPDATE food SET is_published=0 WHERE id=2')
        self.db.execute('UPDATE food SET user_id=22 WHERE id=3')
        self.assertEqual([], self.read('selectFavoritesByUser'))
        self.assertEqual([], self.read('selectDishIdsByUser'))
        for dish_id in (1, 2, 3):
            self.assertEqual([(0,)], self.read('isFavorite', dish_id))

    def test_other_account_favorites_do_not_escape(self):
        self.add(1, 22)
        self.assertEqual([], self.read('selectDishIdsByUser'))
        self.assertEqual([], self.read('selectFavoritesByUser'))
        self.assertEqual([(0,)], self.read('isFavorite', 1))

    def test_duplicate_add_is_unique_and_stale_cleanup_remains_owned(self):
        self.add(1)
        self.add(1)
        self.assertEqual(1, self.db.execute('SELECT COUNT(*) FROM favorite_dishes').fetchone()[0])
        self.db.execute('DELETE FROM food WHERE id=1')
        delete = mapper_sql('delete', 'Delete')
        self.db.execute(delete, {'userId': 22, 'dishId': 1})
        self.assertEqual(1, self.db.execute('SELECT COUNT(*) FROM favorite_dishes').fetchone()[0])
        self.db.execute(delete, {'userId': 11, 'dishId': 1})
        self.assertEqual(0, self.db.execute('SELECT COUNT(*) FROM favorite_dishes').fetchone()[0])


if __name__ == '__main__':
    unittest.main()
