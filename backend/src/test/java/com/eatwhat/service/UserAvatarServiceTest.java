package com.eatwhat.service;

import com.eatwhat.entity.User;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.mapper.UserAvatarMapper;
import org.junit.jupiter.api.Test;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserAvatarServiceTest {
    @Test void replayDoesNotCreateSecondImageAndChangedAvatarRejectsStaleUpload() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bytes)) {
            ImageIO.write(new BufferedImage(1,1,BufferedImage.TYPE_INT_RGB), "png", out);
            out.flush();
        }
        assertArrayEquals(AvatarImageValidator.normalize(bytes.toByteArray()),AvatarImageValidator.normalize(bytes.toByteArray()));
        UserAvatarMapper images = mock(UserAvatarMapper.class);
        UserService users = mock(UserService.class);
        MealConsumptionMapper logs = mock(MealConsumptionMapper.class);
        when(logs.lockUser(1L)).thenReturn(1L);
        when(logs.request(anyLong(),anyString())).thenReturn(null);
        User current = new User(); current.setId(1L); current.setAvatar("old-image");
        when(users.getUserById(1L)).thenReturn(current);
        when(users.updateUserInfo(any())).thenReturn(current);
        UserAvatarService service = new UserAvatarService(images,users,logs);
        service.save(1L,bytes.toByteArray(),"avatar-one","old-image");
        org.mockito.ArgumentCaptor<String> hash = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(logs).log(eq(1L),eq("avatar-one"),hash.capture(),anyString());
        assertEquals(com.eatwhat.util.WorkflowRequestHash.sha256("avatar|old-image|"+java.util.Base64.getEncoder().encodeToString(AvatarImageValidator.normalize(bytes.toByteArray()))),hash.getValue());
        Map<String,Object> recorded = new LinkedHashMap<>();recorded.put("requestHash",hash.getValue());
        when(logs.request(1L,"avatar-one")).thenReturn(recorded);
        service.save(1L,bytes.toByteArray(),"avatar-one","old-image");
        verify(images,times(1)).insert(anyString(),eq(1L),any(byte[].class));
        current.setAvatar("other-device-image");
        assertThrows(MealConsumptionService.VersionConflict.class,()->service.save(1L,bytes.toByteArray(),"avatar-two","old-image"));
        verify(images,times(1)).insert(anyString(),eq(1L),any(byte[].class));
    }
}
