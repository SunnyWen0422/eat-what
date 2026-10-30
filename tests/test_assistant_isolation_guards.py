"""Keep the asyncio wakeup exception private; all unrelated connects stay denied."""
import socket
import threading
import unittest
from unittest.mock import patch
from assistant_v4_isolation import isolated_service


class AssistantIsolationGuardsTest(unittest.TestCase):
    def test_incomplete_connect_is_not_treated_as_a_connected_pair(self):
        sockets = []

        def pending(client, address):
            sockets.append(client)
            raise BlockingIOError("synthetic incomplete connection")

        with patch.object(socket.socket, "connect", pending):
            with isolated_service():
                with patch.object(socket.socket, "accept", side_effect=AssertionError(
                        "accept attempted before successful connection")):
                    with self.assertRaises(BlockingIOError):
                        socket.socketpair()
        self.assertTrue(sockets)
        self.assertTrue(all(client.fileno() == -1 for client in sockets))

    def test_socketpair_does_not_open_connect_for_other_threads_or_destinations(self):
        original_connect, original_listen = socket.socket.connect, socket.socket.listen
        owner = threading.get_ident(); escaped = []; blocked = []
        targets = []

        def observed_original(sock, address):
            # Even the red reproduction cannot contact a real unrelated target.
            if threading.get_ident() != owner or tuple(address[:2]) not in targets:
                escaped.append(address)
                raise AssertionError("connect guard was bypassed")
            return original_connect(sock, address)

        def unrelated(address):
            with socket.socket() as client:
                try: client.connect(address)
                except AssertionError: blocked.append(address)

        def listening(sock, *args, **kwargs):
            result = original_listen(sock, *args, **kwargs)
            targets.append(tuple(sock.getsockname()[:2]))
            attacker = threading.Thread(target=unrelated, args=(targets[-1],))
            attacker.start(); attacker.join(2)
            self.assertFalse(attacker.is_alive())
            unrelated(("198.51.100.10", 443))
            return result

        with patch.object(socket.socket, "connect", observed_original):
            with self.assertRaisesRegex(AssertionError, "Unexpected network/DB attempts: 2"):
                with isolated_service():
                    with patch.object(socket.socket, "listen", listening):
                        left, right = socket.socketpair()
                        try:
                            right.sendall(b"wakeup"); self.assertEqual(b"wakeup", left.recv(6))
                        finally: left.close(); right.close()
                    self.assertEqual([], escaped)
                    self.assertEqual(2, len(blocked))

    def test_plain_socketpair_supports_asyncio_without_network_attempts(self):
        with isolated_service() as service:
            left, right = socket.socketpair()
            try:
                right.sendall(b"ok"); self.assertEqual(b"ok", left.recv(2))
            finally: left.close(); right.close()
            self.assertEqual([], service.network_attempts)


if __name__ == "__main__": unittest.main()
