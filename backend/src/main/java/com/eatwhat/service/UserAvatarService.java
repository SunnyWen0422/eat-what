package com.eatwhat.service;

import com.eatwhat.entity.User;
import com.eatwhat.mapper.MealConsumptionMapper;
import com.eatwhat.mapper.UserAvatarMapper;
import com.eatwhat.util.RequestIdValidator;
import com.eatwhat.util.WorkflowRequestHash;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Base64;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class UserAvatarService {
    private final UserAvatarMapper avatars;
    private final UserService users;
    private final MealConsumptionMapper logs;

    public UserAvatarService(UserAvatarMapper avatars, UserService users, MealConsumptionMapper logs) {
        this.avatars = avatars;
        this.users = users;
        this.logs = logs;
    }

    @Transactional
    public User save(Long userId, byte[] input, String requestId, String expectedAvatar) {
        RequestIdValidator.requireValid(requestId);
        byte[] bytes = AvatarImageValidator.normalize(input);
        String hash = WorkflowRequestHash.sha256("avatar|" + expectedAvatar + "|" + Base64.getEncoder().encodeToString(bytes));
        if (logs.lockUser(userId) == null) throw new IllegalArgumentException("用户不存在");
        Map<String, Object> previous = logs.request(userId, requestId);
        if (previous != null) {
            if (!hash.equals(previous.get("requestHash"))) throw new MealConsumptionService.VersionConflict("请求标识已用于不同操作");
            return users.getUserById(userId);
        }
        User current = users.getUserById(userId);
        String currentAvatar = current.getAvatar() == null ? "" : current.getAvatar();
        if (!Objects.equals(currentAvatar, expectedAvatar)) throw new MealConsumptionService.VersionConflict("头像已更新，请重新读取个人资料后选择头像");
        String imageId = UUID.randomUUID().toString().replace("-", "");
        avatars.insert(imageId, userId, bytes);
        User fields = new User();
        fields.setId(userId);
        fields.setAvatar("/users/avatar-images/" + imageId);
        User saved = users.updateUserInfo(fields);
        avatars.removeOld(userId, imageId);
        // Store only the public image identifier; profile fields never enter the request log.
        logs.log(userId, requestId, hash, "{\"imageId\":\"" + imageId + "\"}");
        return saved;
    }
}
