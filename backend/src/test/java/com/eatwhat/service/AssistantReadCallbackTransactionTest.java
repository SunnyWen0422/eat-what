package com.eatwhat.service;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantReadCallbackTransactionTest {
    static class Manager extends AbstractPlatformTransactionManager {
        int starts,commits;
        protected Object doGetTransaction(){return new Object();}
        protected void doBegin(Object tx,TransactionDefinition definition){starts++;}
        protected void doCommit(DefaultTransactionStatus status){commits++;}
        protected void doRollback(DefaultTransactionStatus status){}
    }
    @Test void constructorRegisteredReadStillHasOneSnapshotWhenProxyIsBypassed(){
        AssistantReadToolTest.Fixture f=new AssistantReadToolTest.Fixture();AssistantReadToolService reads=f.reads();Manager manager=new Manager();reads.configureReadTransaction(manager);
        f.capabilities.registerTurnExecutor((user,id)->{});
        when(f.workspaces.get(7L,f.w.getId())).thenAnswer(call->{
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());assertTrue(TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            assertEquals(TransactionDefinition.ISOLATION_REPEATABLE_READ,TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());return f.w;
        });
        assertNotNull(f.capabilities.readExecutor("read_current_meal").read(7L,f.call("read_current_meal"),f.scope));
        assertEquals(1,manager.starts);assertEquals(1,manager.commits);assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
    }
}
