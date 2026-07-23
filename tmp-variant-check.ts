import { compareVariantValues, compareVariantsBySize, sortVariantSpecs } from "./src/lib/variantSort";

const sizes = ["L", "XS", "M", "S", "XL", "4XL", "2XL", "3XL"];
console.log("sizes sorted:", sizes.sort((a, b) => compareVariantValues(a, b, "Talle")));

const specs = [{ name: "Talle", options: ["L", "XS", "M", "S", "XL", "4XL", "2XL", "3XL"] }];
console.log("specs sorted:", sortVariantSpecs(specs)[0].options);

const variants = [
  { "Talle": "L", "Color": "Negro" },
  { "Talle": "XS", "Color": "Negro" },
  { "Talle": "M", "Color": "Negro" },
  { "Talle": "3XL", "Color": "Negro" },
];
console.log("variants sorted:", variants.sort(compareVariantsBySize));
