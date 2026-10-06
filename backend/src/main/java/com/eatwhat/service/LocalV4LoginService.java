package com.eatwhat.service;
import com.eatwhat.entity.User;
import com.eatwhat.mapper.UserMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.*;

/** Synthetic login exists only in the explicitly isolated local-v4 profile. */
@Service @Profile("local-v4")
public class LocalV4LoginService {
 private final UserMapper users; private final TokenService tokens;
 public LocalV4LoginService(UserMapper users,TokenService tokens,@Value("${server.address:}") String address,@Value("${spring.datasource.url:}") String jdbc) {
  if(!"127.0.0.1".equals(address) || !jdbc.matches("^jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/eatwhat_v4_local_[A-Za-z0-9_]+\\?.*$")) throw new IllegalArgumentException("Local login requires a private loopback database and HTTP binding");
  this.users=users;this.tokens=tokens;
 }
 public Map<String,Object> login() {
  User user=users.selectByOpenId("local-v4-user");if(user==null)throw new IllegalStateException("Local fixture user is missing");
  Map<String,Object> result=new LinkedHashMap<>();result.put("token",tokens.generateToken(user.getId()));result.put("user",user);result.put("isNewUser",false);return result;
 }
}
