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
        "request","candidate_scan","candidate_details","assistant_queue","model_http","confirmation","quality","media"));
    private static final Set<String> OUTCOMES=new HashSet<>(Arrays.asList(
        "success","failed","rejected","timeout","cancelled","degraded","unknown","busy"));
    private final MeterRegistry registry;
    public ExperienceMetrics(MeterRegistry registry){this.registry=registry;}
    public void recordStage(String stage,String outcome,long durationMs,long count){
        if(!STAGES.contains(stage)||!OUTCOMES.contains(outcome)||durationMs<0||count<0)
            throw new IllegalArgumentException("无效的运行指标");
        registry.timer("eatwhat.experience.duration","stage",stage,"outcome",outcome).record(durationMs,TimeUnit.MILLISECONDS);
        registry.summary("eatwhat.experience.items","stage",stage,"outcome",outcome).record(count);
    }
}
