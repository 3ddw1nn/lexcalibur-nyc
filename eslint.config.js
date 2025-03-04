import tseslint from "typescript-eslint";
import apifyConfig from "@apify/eslint-config-ts";

export default tseslint.config(...apifyConfig, {
    rules: {
        "@stylistic/quotes": ["error", "single"],
        "prettier/prettier": ["error", { singleQuote: true }],
    },
});
