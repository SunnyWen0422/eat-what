package com.eatwhat.service;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Iterator;

public final class AvatarImageValidator {
    private AvatarImageValidator() { }
    public static byte[] normalize(byte[] input) {
        if (input == null || input.length == 0 || input.length > 1024 * 1024)
            throw new IllegalArgumentException("头像文件应在 1MB 以内");
        try (ImageInputStream stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(input))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new IllegalArgumentException("请选择 PNG 或 JPEG 图片");
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                String format = reader.getFormatName();
                if (!"png".equalsIgnoreCase(format) && !"jpeg".equalsIgnoreCase(format))
                    throw new IllegalArgumentException("请选择 PNG 或 JPEG 图片");
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 2048 || height > 2048)
                    throw new IllegalArgumentException("头像宽高应在 2048 像素以内");
                BufferedImage decoded = reader.read(0);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                // Re-encoding excludes uploaded metadata and executable/polyglot tails.
                try (MemoryCacheImageOutputStream streamOut = new MemoryCacheImageOutputStream(output)) {
                    if (!ImageIO.write(decoded, "png", streamOut)) throw new IllegalStateException("头像编码器不可用");
                    streamOut.flush();
                }
                if (output.size() > 1024 * 1024) throw new IllegalArgumentException("头像过大，请压缩后重试");
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IllegalArgumentException error) { throw error; }
        catch (Exception error) { throw new IllegalArgumentException("头像图片无法读取，请重新选择", error); }
    }
}
