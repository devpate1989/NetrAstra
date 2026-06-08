import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * App-wide typography: Noto Sans Devanagari is Google's Noto family for
 * Devanagari script, drawn (like Noto Sans) from the same "no tofu" project so
 * Hindi and English render with matching metrics in one face — the same pairing
 * already used for generated report PDFs (see reportPdf.service.ts).
 */
const WEIGHT_FONTS: Record<string, string> = {
  "100": "NotoSansDevanagari_100Thin",
  "200": "NotoSansDevanagari_200ExtraLight",
  "300": "NotoSansDevanagari_300Light",
  "400": "NotoSansDevanagari_400Regular",
  normal: "NotoSansDevanagari_400Regular",
  "500": "NotoSansDevanagari_500Medium",
  "600": "NotoSansDevanagari_600SemiBold",
  "700": "NotoSansDevanagari_700Bold",
  bold: "NotoSansDevanagari_700Bold",
  "800": "NotoSansDevanagari_800ExtraBold",
  "900": "NotoSansDevanagari_900Black",
};

const CLASS_NAME_FONTS: Record<string, string> = {
  "font-thin": WEIGHT_FONTS["100"],
  "font-extralight": WEIGHT_FONTS["200"],
  "font-light": WEIGHT_FONTS["300"],
  "font-normal": WEIGHT_FONTS["400"],
  "font-medium": WEIGHT_FONTS["500"],
  "font-semibold": WEIGHT_FONTS["600"],
  "font-bold": WEIGHT_FONTS["700"],
  "font-extrabold": WEIGHT_FONTS["800"],
  "font-black": WEIGHT_FONTS["900"],
};

const DEFAULT_FONT = WEIGHT_FONTS["400"];

// Custom fonts don't synthesize bold/italic the way system fonts do, so the
// weight has to be resolved to a specific loaded family up front — first from
// an explicit style.fontFamily/fontWeight, then from a Tailwind `font-*`
// className utility, falling back to the regular weight.
function resolveFontFamily(style: StyleProp<TextStyle>, className?: string): string {
  const flat = StyleSheet.flatten(style);
  if (flat?.fontFamily) return flat.fontFamily;
  if (flat?.fontWeight != null) {
    const fromStyle = WEIGHT_FONTS[String(flat.fontWeight)];
    if (fromStyle) return fromStyle;
  }
  if (className) {
    for (const token of className.split(/\s+/)) {
      const fromClassName = CLASS_NAME_FONTS[token];
      if (fromClassName) return fromClassName;
    }
  }
  return DEFAULT_FONT;
}

export function Text({ style, className, ...props }: TextProps) {
  return <RNText className={className} style={[{ fontFamily: resolveFontFamily(style, className) }, style]} {...props} />;
}

export function TextInput({ style, className, ...props }: TextInputProps) {
  return (
    <RNTextInput className={className} style={[{ fontFamily: resolveFontFamily(style, className) }, style]} {...props} />
  );
}
