"""Canonical acceptance follows one real request through client execution checkpoints."""
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import canonical_assistant_acceptance as assistant


def checkpoint(**overrides):
    turn={"turnId":"original-turn","status":"awaiting_confirmation","pendingAction":None,
          "retryable":True,"reply":None,"cards":[],
          "continuation":{"revision":1,"cursor":0,"steps":[{"stepId":"step-1","status":"pending"}]}}
    turn.update(overrides)
    return turn


class CanonicalAssistantPollTest(unittest.TestCase):
    def runner(self,responses):
        runner=assistant.Acceptance({},None,Mock())
        runner.http=Mock(side_effect=responses)
        return runner

    def test_normal_execution_checkpoint_resumes_same_turn_without_a_new_question(self):
        done={"turnId":"original-turn","status":"completed","cards":[{"receiptRef":"workspace:real"}]}
        runner=self.runner([{"turnId":"original-turn","status":"running"},checkpoint(),done])
        with patch.object(assistant.time,"sleep"):
            actual=runner.poll(910001,"original-turn")
        self.assertEqual("completed",actual["status"])
        self.assertEqual("workspace:real",actual["cards"][0]["receiptRef"])
        self.assertEqual([(("/assistant/v4/turns/original-turn",),{"user":910001}),
                          (("/assistant/v4/turns/original-turn",),{"user":910001}),
                          (("/assistant/v4/turns/original-turn/resume",{},910001),{})],runner.http.call_args_list)

    def test_one_unchanged_checkpoint_is_resumed_at_most_once_then_only_read(self):
        done={"turnId":"original-turn","status":"completed"}
        runner=self.runner([checkpoint(),checkpoint(),done])
        with patch.object(assistant.time,"sleep"):
            self.assertEqual("completed",runner.poll(910001,"original-turn")["status"])
        self.assertEqual(1,sum(call.args[0].endswith("/resume") for call in runner.http.call_args_list))

    def test_real_preview_and_definite_preparation_failure_keep_their_recovery_boundary(self):
        for waiting in (checkpoint(pendingAction={"taskId":"real-preview"}),
                        checkpoint(reply="下一步准备失败，请重试",retryable=True)):
            runner=self.runner([waiting])
            self.assertEqual(waiting,runner.poll(910001,"original-turn"))
            runner.http.assert_called_once_with("/assistant/v4/turns/original-turn",user=910001)

    def test_cancellation_partial_completion_and_clarification_are_not_retried(self):
        for status in ("cancelled","partially_completed","needs_input","failed"):
            result={"turnId":"original-turn","status":status,"cards":[{"receiptRef":"calendar:kept"}]}
            runner=self.runner([result]);self.assertEqual(result,runner.poll(910001,"original-turn"));self.assertEqual(1,runner.http.call_count)

    def test_other_request_cannot_be_accepted_as_this_turns_success(self):
        runner=self.runner([{"turnId":"other-turn","status":"completed"}])
        with self.assertRaisesRegex(AssertionError,"identity"):
            runner.poll(910001,"original-turn")

    def test_unchanged_checkpoint_timeout_does_not_repeat_business_or_model_intent(self):
        runner=self.runner([checkpoint(),checkpoint()])
        with patch.object(assistant.time,"monotonic",side_effect=[0,0,41]),patch.object(assistant.time,"sleep"):
            with self.assertRaisesRegex(AssertionError,"40 seconds"):
                runner.poll(910001,"original-turn")
        self.assertEqual(1,sum(call.args[0].endswith("/resume") for call in runner.http.call_args_list))


if __name__=="__main__":unittest.main()
