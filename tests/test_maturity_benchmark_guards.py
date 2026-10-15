import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]

class MaturityBenchmarkGuardsTest(unittest.TestCase):
    def test_submillisecond_latency_and_actual_sustained_time_are_not_rounded_to_ticks_or_requested_duration(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        try:
            import benchmark_maturity as m
            with patch.object(m.time,'perf_counter',return_value=20.0004),patch.object(m.time,'monotonic',return_value=0):
                self.assertAlmostEqual(.4,m.elapsed_ms(20),places=2)
            self.assertEqual(12,m.sustained_seconds([{'variant':'candidate','requestedSeconds':300,'elapsedSeconds':12}]))
            self.assertEqual(300,m.sustained_seconds([{'variant':'candidate','requestedSeconds':300,'elapsedSeconds':305},{'variant':'baseline','requestedSeconds':20,'elapsedSeconds':21}]))
        finally:sys.path.remove(str(ROOT/'scripts'))

    def test_reuses_client_for_polls_and_rejects_foreign_urls_and_http_errors(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        try:
            import benchmark_maturity as m
            import httpx
            original=httpx.Client;created=[];calls=[]
            def handler(request):
                calls.append(request)
                return httpx.Response(503 if request.url.path.endswith('busy') else 200,json={'synthetic':True})
            def factory(**kwargs):
                self.assertFalse(kwargs['trust_env']);self.assertFalse(kwargs['follow_redirects']);created.append(kwargs)
                return original(**kwargs,transport=httpx.MockTransport(handler))
            with self.assertRaises(ValueError):m.PersistentAPI({'api':'https://chishenme.icu/api'})
            with patch('httpx.Client',factory):
                api=m.PersistentAPI({'api':'http://127.0.0.1:18780/api','tokenSecret':'synthetic-private-only'})
                try:
                    api('/poll');api('/poll')
                    with self.assertRaises(m.BenchmarkHttpError) as error:api('/busy')
                    self.assertEqual(503,error.exception.status)
                    with self.assertRaises(ValueError):api('//outside.invalid')
                    with self.assertRaises(ValueError):api('https://outside.invalid')
                finally:api.close()
            self.assertEqual(1,len(created));self.assertEqual(3,len(calls));self.assertTrue(all(r.url.host=='127.0.0.1' for r in calls))
        finally:sys.path.remove(str(ROOT/'scripts'))

if __name__=='__main__':unittest.main()
