"""No network or database: contract tests for the owned load coordinator."""
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import benchmark_maturity as benchmark


class ExperienceBenchmarkPopulationTest(unittest.TestCase):
    def test_per_worker_population_matches_declared_users(self):
        rows = {}
        authenticated = []
        def create(count):
            for index in range(count):
                rows[920001 + index] = {'id': 920001 + index, 'status': 1}
            return sorted(rows)[:count]
        def http(path, user):
            self.assertEqual('/users/info', path)
            self.assertIn(user, rows, 'a signed nonexistent user is not a population')
            authenticated.append(user)
            return {'user': rows[user]}
        users = benchmark.prepare_population(SimpleNamespace(create_benchmark_users=create), 25, 'per-worker', http)
        self.assertEqual(25, len(users))
        self.assertEqual(25, len(set(users)))
        self.assertEqual(set(rows), set(authenticated))

    def test_two_shared_declares_two_accounts_and_verifies_both(self):
        seen = []
        def http(path, user):
            seen.append(user)
            return {'user': {'id': user}}
        users = benchmark.prepare_population(SimpleNamespace(), 25, 'two-shared', http)
        self.assertEqual([910001, 910002], seen)
        self.assertEqual(25, len(users))
        self.assertEqual({910001, 910002}, set(users))

    def test_unverified_or_duplicate_accounts_fail_before_load(self):
        runtime = SimpleNamespace(create_benchmark_users=lambda n: [920001] * n)
        with self.assertRaises(ValueError):
            benchmark.prepare_population(runtime, 25, 'per-worker', lambda *a, **k: None)
        runtime.create_benchmark_users = lambda n: list(range(920001, 920001+n))
        with self.assertRaises(ValueError):
            benchmark.prepare_population(runtime, 1, 'per-worker', lambda *a, **k: {'user': {'id': 99}})

    def test_equal_duration_is_default_and_legacy_is_explicit_diagnostic(self):
        args = benchmark.parser().parse_args(['--config', 'unused', '--out', 'unused'])
        self.assertEqual('two-shared', args.user_mode)
        self.assertEqual('equal', args.comparison_duration)
        self.assertEqual(300, benchmark.scenario_seconds('baseline', 300, 'equal'))
        self.assertEqual(20, benchmark.scenario_seconds('baseline', 300, 'legacy-20s'))
        self.assertEqual(300, benchmark.scenario_seconds('candidate', 300, 'legacy-20s'))

    def test_dead_workers_cannot_satisfy_sustained_duration(self):
        row = dict(variant='candidate', requestedSeconds=300, elapsedSeconds=310,
                   allWorkersCompletedOffer=True, workersStoppedAfterFailedRecovery=[], residualWorkers=0)
        self.assertEqual(300, benchmark.sustained_seconds([row]))
        self.assertEqual(0, benchmark.sustained_seconds([dict(row, allWorkersCompletedOffer=False)]))
        self.assertEqual(0, benchmark.sustained_seconds([dict(row, workersStoppedAfterFailedRecovery=[0])]))
        self.assertEqual(0, benchmark.sustained_seconds([dict(row, residualWorkers=1)]))


if __name__ == '__main__':
    unittest.main()
