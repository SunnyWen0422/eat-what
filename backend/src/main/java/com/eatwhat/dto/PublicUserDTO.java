package com.eatwhat.dto;

import com.eatwhat.entity.User;

import java.util.Date;

/** Public profile shape. Internal WeChat identifiers never cross the API boundary. */
public class PublicUserDTO {
    private Long id;
    private String nickname;
    private String avatar;
    private String phone;
    private Integer status;
    private Date registerTime;
    private Date lastLoginTime;

    public static PublicUserDTO from(User user) {
        if (user == null) return null;
        PublicUserDTO dto = new PublicUserDTO();
        dto.id = user.getId();
        dto.nickname = user.getNickname();
        dto.avatar = user.getAvatar();
        dto.phone = user.getPhone();
        dto.status = user.getStatus();
        dto.registerTime = user.getRegisterTime();
        dto.lastLoginTime = user.getLastLoginTime();
        return dto;
    }

    public Long getId() { return id; }
    public String getNickname() { return nickname; }
    public String getAvatar() { return avatar; }
    public String getPhone() { return phone; }
    public Integer getStatus() { return status; }
    public Date getRegisterTime() { return registerTime; }
    public Date getLastLoginTime() { return lastLoginTime; }
}
