package com.eatwhat.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;

/** Field-local exact integer parsing for meal people and composition counts only. */
public final class MealIntegerDeserializer extends StdDeserializer<Integer> {
    public MealIntegerDeserializer() { super(Integer.class); }

    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JsonToken token=parser.currentToken();
        try {
            if (token==JsonToken.VALUE_NUMBER_INT || token==JsonToken.VALUE_NUMBER_FLOAT) {
                // BigDecimal reads the original numeric text; double rounding or int truncation
                // could otherwise hide a fraction, including an out-of-range 10.9 or 50.9.
                return parser.getDecimalValue().intValueExact();
            }
            if (token==JsonToken.VALUE_STRING) {
                String value=parser.getText().trim();
                // Preserve ordinary legacy integer-string/blank coercion. The rule layer
                // rejects null, unknown keys, out-of-range integers and invalid totals.
                if (value.isEmpty()) return null;
                if (value.matches("[+-]?[0-9]+")) return Integer.valueOf(value);
            }
        } catch (ArithmeticException | NumberFormatException error) {
            throw JsonMappingException.from(parser,"本餐人数和菜数须为有效整数，不能包含小数部分",error);
        }
        throw JsonMappingException.from(parser,"本餐人数和菜数须为有效整数，不能包含小数部分");
    }
}
