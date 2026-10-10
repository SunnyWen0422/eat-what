package com.eatwhat.config;

import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.*;
import static org.junit.jupiter.api.Assertions.*;

class PublicCatalogPropertiesTest {
    @Test void defaultsToDisabledWithAnEmptyReleaseList() {
        PublicCatalogProperties p = new PublicCatalogProperties();
        assertFalse(p.isEnabled()); assertTrue(p.getAllowedDishIds().isEmpty());
    }
    @Test void invalidReleaseListsCannotBroadenAccess() {
        PublicCatalogProperties p = new PublicCatalogProperties();
        for (List<Long> bad : Arrays.asList(Arrays.asList(0L), Arrays.asList(-1L), Arrays.asList((Long)null), Arrays.asList(1L,1L), Arrays.asList(9007199254740992L), LongStream.rangeClosed(1,501).boxed().collect(Collectors.toList())))
            assertThrows(IllegalArgumentException.class, () -> p.setAllowedDishIds(bad));
        assertThrows(IllegalArgumentException.class, () -> p.setAllowedDishIds(null));
        assertTrue(p.getAllowedDishIds().isEmpty());
    }
    @Test void releaseListIsDefensivelyCopiedAndCannotBeMutated() {
        List<Long> input = new ArrayList<>(Arrays.asList(1L,2L));
        PublicCatalogProperties p = new PublicCatalogProperties(); p.setAllowedDishIds(input); input.add(3L);
        assertEquals(Arrays.asList(1L,2L),p.getAllowedDishIds());
        assertThrows(UnsupportedOperationException.class, () -> p.getAllowedDishIds().add(4L));
    }
}
