package com.eatwhat.service;
import com.eatwhat.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class LocalV4LoginServiceTest {
 @Test void permitsOnlyTheNewExplicitMaturityLocalPrefix(){
  assertDoesNotThrow(()->new LocalV4LoginService(mock(UserMapper.class),mock(TokenService.class),"127.0.0.1","jdbc:mysql://127.0.0.1:12345/eatwhat_maturity_local_fixture?useSSL=false"));
  assertThrows(IllegalArgumentException.class,()->new LocalV4LoginService(mock(UserMapper.class),mock(TokenService.class),"127.0.0.1","jdbc:mysql://127.0.0.1:3306/food?useSSL=false"));
 }
 @Test void refusesNonLocalDatabaseOrNetworkBinding() {
  assertThrows(IllegalArgumentException.class,()->new LocalV4LoginService(mock(UserMapper.class),mock(TokenService.class),"0.0.0.0","jdbc:mysql://127.0.0.1:3306/eatwhat_v4_local_test"));
  assertThrows(IllegalArgumentException.class,()->new LocalV4LoginService(mock(UserMapper.class),mock(TokenService.class),"127.0.0.1","jdbc:mysql://remote:3306/food"));
 }
}
