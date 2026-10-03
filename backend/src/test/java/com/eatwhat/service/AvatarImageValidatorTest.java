package com.eatwhat.service;
import org.junit.jupiter.api.Test;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import static org.junit.jupiter.api.Assertions.*;
class AvatarImageValidatorTest {
    @Test void rejectsNonImageAndOversizedData() {
        assertThrows(IllegalArgumentException.class, () -> AvatarImageValidator.normalize("not-an-image".getBytes()));
        assertThrows(IllegalArgumentException.class, () -> AvatarImageValidator.normalize(new byte[1048577]));
    }
    @Test void normalizesValidAvatarToPng() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (javax.imageio.stream.MemoryCacheImageOutputStream stream = new javax.imageio.stream.MemoryCacheImageOutputStream(bytes)) {
            ImageIO.write(new BufferedImage(32,32,BufferedImage.TYPE_INT_RGB),"png",stream); stream.flush();
        }
        byte[] normalized = AvatarImageValidator.normalize(bytes.toByteArray());
        try (javax.imageio.stream.MemoryCacheImageInputStream stream = new javax.imageio.stream.MemoryCacheImageInputStream(new java.io.ByteArrayInputStream(normalized))) {
            javax.imageio.ImageReader reader=ImageIO.getImageReaders(stream).next();
            try { reader.setInput(stream); assertEquals(32,reader.read(0).getWidth()); }
            finally { reader.dispose(); }
        }
    }
}
