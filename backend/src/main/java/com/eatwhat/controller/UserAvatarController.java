package com.eatwhat.controller;
import com.eatwhat.dto.PublicUserDTO;
import com.eatwhat.mapper.UserAvatarMapper;
import com.eatwhat.service.UserAvatarService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
@RestController
@RequestMapping("/users")
public class UserAvatarController {
    private final UserAvatarService service;
    private final UserAvatarMapper mapper;
    public UserAvatarController(UserAvatarService service,UserAvatarMapper mapper){this.service=service;this.mapper=mapper;}
    @PostMapping("/avatar")
    public Map<String,Object> upload(@RequestParam("file") MultipartFile file,@RequestParam String requestId,@RequestParam(defaultValue="") String expectedAvatar,HttpServletRequest request) throws IOException {
        if(file.getSize()<1||file.getSize()>1024*1024)throw new IllegalArgumentException("头像文件应在 1MB 以内");
        Map<String,Object> result=new LinkedHashMap<>();result.put("success",true);
        result.put("user",PublicUserDTO.from(service.save((Long)request.getAttribute("currentUserId"),file.getBytes(),requestId,expectedAvatar)));
        return result;
    }
    // A random identifier exposes only a user-selected display avatar, never other account data.
    @GetMapping("/avatar-images/{imageId}")
    public ResponseEntity<byte[]> image(@PathVariable String imageId) {
        if(!imageId.matches("[a-f0-9]{32}"))return ResponseEntity.notFound().build();
        com.eatwhat.entity.UserAvatar image=mapper.read(imageId);
        if(image==null)return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header("X-Content-Type-Options","nosniff")
            .cacheControl(CacheControl.noCache()).body(image.getImageBytes());
    }
}
