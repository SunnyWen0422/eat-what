package com.eatwhat.service;

import com.eatwhat.dto.UserPreferenceDTO;
import com.eatwhat.entity.UserPreference;
import com.eatwhat.mapper.UserPreferenceMapper;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserPreferenceServiceTest {

    private final UserPreferenceMapper mapper = mock(UserPreferenceMapper.class);
    private final RecommendationMetadataService metadata = mock(RecommendationMetadataService.class);
    private final UserPreferenceService service = new UserPreferenceService(mapper, metadata);

    @Test
    void missingPreferencesReturnSafeDefaults() {
        when(mapper.selectByUserId(7L)).thenReturn(null);

        UserPreferenceDTO result = service.get(7L);

        assertEquals(Collections.emptyList(), result.getPreferredCuisineCodes());
        assertEquals(7, result.getAvoidRecentDays());
        assertEquals(1, result.getVersion());
    }

    @Test
    void saveNormalizesDuplicatesAndPersistsJson() {
        when(metadata.isKnownCuisine("SICHUAN")).thenReturn(true);
        when(metadata.isKnownCuisine("CANTONESE")).thenReturn(true);
        when(metadata.isKnownTag("HOME_STYLE")).thenReturn(true);
        UserPreferenceDTO input = new UserPreferenceDTO();
        input.setPreferredCuisineCodes(Arrays.asList("SICHUAN", " sichuan ", "CANTONESE"));
        input.setPreferredTagCodes(Arrays.asList("HOME_STYLE", "HOME_STYLE"));
        input.setExcludedIngredients(Arrays.asList(" 花生 ", "花生"));
        input.setAvoidRecentDays(99);

        UserPreferenceDTO result = service.save(9L, input);

        assertEquals(Arrays.asList("CANTONESE", "SICHUAN"), result.getPreferredCuisineCodes());
        assertEquals(Collections.singletonList("HOME_STYLE"), result.getPreferredTagCodes());
        assertEquals(Collections.singletonList("花生"), result.getExcludedIngredients());
        assertEquals(30, result.getAvoidRecentDays());
        verify(mapper).upsert(any(UserPreference.class));
    }

    @Test
    void saveRejectsUnknownCatalogCodes() {
        when(metadata.isKnownCuisine("UNKNOWN")).thenReturn(false);
        UserPreferenceDTO input = new UserPreferenceDTO();
        input.setPreferredCuisineCodes(Collections.singletonList("UNKNOWN"));

        assertThrows(IllegalArgumentException.class, () -> service.save(1L, input));
    }
}
