package com.eatwhat.service;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Bounded operational labels only; never accept identities or user/provider text. */
@Component
public class ExperienceMetrics {
    private static final Set<String> STAGES=new HashSet<>(Arrays.asList(
        "request","candidate_scan","candidate_details","assistant_queue","task_execution","model_http","confirmation","quality","media"));
    private static final Set<String> OUTCOMES=new HashSet<>(Arrays.asList(
        "success","error","timeout","cancel","recover"));
    private final MeterRegistry registry;
    public ExperienceMetrics(MeterRegistry registry){this.registry=registry;}
    public void recordStage(String stage,String outcome,long durationMs,long count){
        // Compatibility is an explicit bounded map, never an arbitrary fallback label.
        if(Arrays.asList("failed","rejected","unknown","busy").contains(outcome))outcome="error";
        else if("cancelled".equals(outcome))outcome="cancel";
        else if("degraded".equals(outcome))outcome="recover";
        if(!STAGES.contains(stage)||!OUTCOMES.contains(outcome)||durationMs<0||count<0)
            throw new IllegalArgumentException("无效的运行指标");
        try {
            registry.timer("eatwhat.experience.duration","stage",stage,"outcome",outcome).record(durationMs,TimeUnit.MILLISECONDS);
            registry.summary("eatwhat.experience.items","stage",stage,"outcome",outcome).record(count);
        } catch(RuntimeException unavailable) { /* Observation must not fail a business response. */ }
    }
    /** Also protects callers from an injected/replaced sink throwing before registry access. */
    public static void observe(ExperienceMetrics metrics,String stage,String outcome,long millis,long count){
        try{if(metrics!=null)metrics.recordStage(stage,outcome,Math.max(0,millis),Math.max(0,count));}
        catch(RuntimeException unavailable){/* fail open */}
    }
    public static String failure(Throwable error){
        for(int depth=0;error!=null&&depth<8;depth++,error=error.getCause()){
            if(error instanceof java.util.concurrent.TimeoutException||error instanceof java.net.SocketTimeoutException)return "timeout";
            if(error instanceof InterruptedException||error instanceof java.util.concurrent.CancellationException)return "cancel";
        }
        return "error";
    }
    public static <T> java.util.List<T> rows(ExperienceMetrics metrics,String stage,java.util.function.Supplier<java.util.List<T>> query){
        long start=System.nanoTime();String outcome="error";long count=0;
        try{java.util.List<T> rows=query.get();count=rows==null?0:rows.size();outcome="success";return rows;}
        finally{observe(metrics,stage,outcome,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),count);}
    }
    /** Register while the original domain transaction is active; success means commit, not method return. */
    public static <T> T confirmation(ExperienceMetrics metrics,java.util.function.Supplier<T> action,java.util.function.ToLongFunction<T> items){
        final long start=System.nanoTime();
        T result;
        try{result=action.get();}
        catch(RuntimeException error){observe(metrics,"confirmation","error",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),0);throw error;}
        try {
            final long count=items.applyAsLong(result);
            if(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                    &&org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()){
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){
                    @Override public void afterCompletion(int status){observe(metrics,"confirmation",status==STATUS_COMMITTED?"success":"error",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),status==STATUS_COMMITTED?count:0);}
                });
            }else observe(metrics,"confirmation","success",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),count);
        }catch(RuntimeException unavailable){/* Metric bookkeeping cannot change the business result. */}
        return result;
    }
}
