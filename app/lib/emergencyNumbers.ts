import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface EmergencyNumber {
  number: string;
  title: string;
  titleHindi: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    title: "National Emergency Number",
    titleHindi: "एकीकृत आपातकालीन नंबर",
    description: "Single number for police, fire, and medical emergencies anywhere in India.",
    icon: "phone-alert",
  },
  {
    number: "100",
    title: "Police",
    titleHindi: "पुलिस",
    description: "Report a crime in progress or request police assistance.",
    icon: "police-badge",
  },
  {
    number: "101",
    title: "Fire Brigade",
    titleHindi: "अग्निशमन सेवा",
    description: "Report a fire or request fire and rescue services.",
    icon: "fire-truck",
  },
  {
    number: "102",
    title: "Ambulance (Free)",
    titleHindi: "एम्बुलेंस (नि:शुल्क)",
    description: "Free ambulance service for medical emergencies, including pregnancy and childbirth.",
    icon: "ambulance",
  },
  {
    number: "108",
    title: "Emergency Medical Services",
    titleHindi: "आपातकालीन चिकित्सा सेवा",
    description: "Emergency response and ambulance service for accidents and serious medical emergencies.",
    icon: "hospital-box",
  },
  {
    number: "1098",
    title: "Child Helpline",
    titleHindi: "चाइल्ड हेल्पलाइन",
    description: "Report cases of child abuse, abandonment, or children in need of care and protection.",
    icon: "account-child",
  },
  {
    number: "1091",
    title: "Women Helpline",
    titleHindi: "महिला हेल्पलाइन",
    description: "Report harassment, abuse, or any emergency concerning women's safety.",
    icon: "human-female",
  },
  {
    number: "1930",
    title: "Cyber Crime Helpline",
    titleHindi: "साइबर अपराध हेल्पलाइन",
    description: "Report financial fraud and other cyber crimes to the National Cyber Crime Reporting Portal.",
    icon: "security-network",
  },
];
