package com.eatwhat.util;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class WorkflowRequestHash {
    private WorkflowRequestHash() { }
    public static String sha256(String value) {
        try {
            byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result=new StringBuilder();
            for(byte b:bytes)result.append(String.format("%02x",b & 255));
            return result.toString();
        }catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 unavailable",e);}
    }
}
