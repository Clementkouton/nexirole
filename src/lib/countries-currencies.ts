/**
 * NexiRole — Liste exhaustive des pays du monde et de leur devise officielle.
 *
 * Utilisée par le Coach de Négociation Salariale (sélecteur « Pays et Devise »
 * de /dashboard/negociation) et validée côté serveur par /api/salary-coach.
 *
 * Contenu :
 *   - les 193 États membres de l'ONU, sans exception, plus le Vatican, la
 *     Palestine (États observateurs), Taïwan et le Kosovo (reconnus par une
 *     majorité d'États) — soit 197 entrées ;
 *   - pour chaque pays : code ISO 3166-1 alpha-2, nom complet en français,
 *     drapeau emoji (dérivé AUTOMATIQUEMENT du code ISO : zéro faute de
 *     frappe possible), devise officielle (code ISO 4217 + nom + symbole) ;
 *   - tri alphabétique FRANÇAIS (accents compris) garanti au chargement
 *     via localeCompare("fr").
 *
 * Le tableau est EXPORTÉ trié : inutile de retrier côté client.
 */

export interface PaysDevise {
  /** Code ISO 3166-1 alpha-2 (ex. "BJ", "FR", "CA"). */
  code: string;
  /** Nom complet du pays en français (ex. "Bénin", "Côte d'Ivoire"). */
  name: string;
  /** Drapeau emoji (ex. "🇧🇯"). */
  flag: string;
  /** Code devise ISO 4217 (ex. "XOF", "EUR", "USD"). */
  currencyCode: string;
  /** Nom de la devise en français (ex. "Franc CFA (BCEAO)"). */
  currencyName: string;
  /** Symbole d'usage courant (ex. "FCFA", "€", "$", "DH"). */
  currencySymbol: string;
}

/** Drapeau emoji = 2 lettres du code ISO décalées dans le bloc régional Unicode. */
function drapeauDepuisCode(code: string): string {
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((lettre) => 0x1f1e6 + lettre.charCodeAt(0) - 65)
  );
}

type EntreePays = Omit<PaysDevise, "flag">;

const ENTREES: Array<EntreePays> = [
  /* ── Afrique ─────────────────────────────────────────────────────────── */
  { code: "ZA", name: "Afrique du Sud", currencyCode: "ZAR", currencyName: "Rand sud-africain", currencySymbol: "R" },
  { code: "DZ", name: "Algérie", currencyCode: "DZD", currencyName: "Dinar algérien", currencySymbol: "DA" },
  { code: "AO", name: "Angola", currencyCode: "AOA", currencyName: "Kwanza angolais", currencySymbol: "Kz" },
  { code: "BJ", name: "Bénin", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "BW", name: "Botswana", currencyCode: "BWP", currencyName: "Pula du Botswana", currencySymbol: "P" },
  { code: "BF", name: "Burkina Faso", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "BI", name: "Burundi", currencyCode: "BIF", currencyName: "Franc burundais", currencySymbol: "FBu" },
  { code: "CM", name: "Cameroun", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "CV", name: "Cap-Vert", currencyCode: "CVE", currencyName: "Escudo cap-verdien", currencySymbol: "Esc" },
  { code: "CF", name: "Centrafrique (République centrafricaine)", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "KM", name: "Comores", currencyCode: "KMF", currencyName: "Franc comorien", currencySymbol: "FC" },
  { code: "CG", name: "Congo (République du)", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "CD", name: "Congo (République démocratique du)", currencyCode: "CDF", currencyName: "Franc congolais", currencySymbol: "FC" },
  { code: "CI", name: "Côte d'Ivoire", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "DJ", name: "Djibouti", currencyCode: "DJF", currencyName: "Franc djiboutien", currencySymbol: "FDJ" },
  { code: "EG", name: "Égypte", currencyCode: "EGP", currencyName: "Livre égyptienne", currencySymbol: "E£" },
  { code: "ER", name: "Érythrée", currencyCode: "ERN", currencyName: "Nakfa érythréen", currencySymbol: "Nkf" },
  { code: "SZ", name: "Eswatini", currencyCode: "SZL", currencyName: "Lilangeni du Swaziland", currencySymbol: "E" },
  { code: "ET", name: "Éthiopie", currencyCode: "ETB", currencyName: "Birr éthiopien", currencySymbol: "Br" },
  { code: "GA", name: "Gabon", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "GM", name: "Gambie", currencyCode: "GMD", currencyName: "Dalasi gambien", currencySymbol: "D" },
  { code: "GH", name: "Ghana", currencyCode: "GHS", currencyName: "Cedi ghanéen", currencySymbol: "GH₵" },
  { code: "GN", name: "Guinée", currencyCode: "GNF", currencyName: "Franc guinéen", currencySymbol: "FG" },
  { code: "GW", name: "Guinée-Bissau", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "GQ", name: "Guinée équatoriale", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "KE", name: "Kenya", currencyCode: "KES", currencyName: "Shilling kényan", currencySymbol: "KSh" },
  { code: "LS", name: "Lesotho", currencyCode: "LSL", currencyName: "Loti du Lesotho", currencySymbol: "M" },
  { code: "LR", name: "Libéria", currencyCode: "LRD", currencyName: "Dollar libérien", currencySymbol: "L$" },
  { code: "LY", name: "Libye", currencyCode: "LYD", currencyName: "Dinar libyen", currencySymbol: "LD" },
  { code: "MG", name: "Madagascar", currencyCode: "MGA", currencyName: "Ariary malgache", currencySymbol: "Ar" },
  { code: "MW", name: "Malawi", currencyCode: "MWK", currencyName: "Kwacha malawite", currencySymbol: "MK" },
  { code: "ML", name: "Mali", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "MA", name: "Maroc", currencyCode: "MAD", currencyName: "Dirham marocain", currencySymbol: "DH" },
  { code: "MU", name: "Maurice", currencyCode: "MUR", currencyName: "Roupie mauricienne", currencySymbol: "Rs" },
  { code: "MR", name: "Mauritanie", currencyCode: "MRU", currencyName: "Ouguiya mauritanienne", currencySymbol: "UM" },
  { code: "MZ", name: "Mozambique", currencyCode: "MZN", currencyName: "Metical du Mozambique", currencySymbol: "MT" },
  { code: "NA", name: "Namibie", currencyCode: "NAD", currencyName: "Dollar namibien", currencySymbol: "N$" },
  { code: "NE", name: "Niger", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "NG", name: "Nigeria", currencyCode: "NGN", currencyName: "Naira nigérian", currencySymbol: "₦" },
  { code: "UG", name: "Ouganda", currencyCode: "UGX", currencyName: "Shilling ougandais", currencySymbol: "USh" },
  { code: "ST", name: "São Tomé-et-Príncipe", currencyCode: "STN", currencyName: "Dobra de São Tomé", currencySymbol: "Db" },
  { code: "RW", name: "Rwanda", currencyCode: "RWF", currencyName: "Franc rwandais", currencySymbol: "FRw" },
  { code: "SN", name: "Sénégal", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "SC", name: "Seychelles", currencyCode: "SCR", currencyName: "Roupie seychelloise", currencySymbol: "SR" },
  { code: "SL", name: "Sierra Leone", currencyCode: "SLE", currencyName: "Leone sierra-léonais", currencySymbol: "Le" },
  { code: "SO", name: "Somalie", currencyCode: "SOS", currencyName: "Shilling somalien", currencySymbol: "Sh" },
  { code: "SD", name: "Soudan", currencyCode: "SDG", currencyName: "Livre soudanaise", currencySymbol: "SDG" },
  { code: "SS", name: "Soudan du Sud", currencyCode: "SSP", currencyName: "Livre sud-soudanaise", currencySymbol: "SSP" },
  { code: "TZ", name: "Tanzanie", currencyCode: "TZS", currencyName: "Shilling tanzanien", currencySymbol: "TSh" },
  { code: "TD", name: "Tchad", currencyCode: "XAF", currencyName: "Franc CFA (BEAC)", currencySymbol: "FCFA" },
  { code: "TG", name: "Togo", currencyCode: "XOF", currencyName: "Franc CFA (BCEAO)", currencySymbol: "FCFA" },
  { code: "TN", name: "Tunisie", currencyCode: "TND", currencyName: "Dinar tunisien", currencySymbol: "DT" },
  { code: "ZM", name: "Zambie", currencyCode: "ZMW", currencyName: "Kwacha zambien", currencySymbol: "ZK" },
  { code: "ZW", name: "Zimbabwe", currencyCode: "ZWG", currencyName: "Dollar zimbabwéen (ZiG)", currencySymbol: "ZiG" },

  /* ── Europe ──────────────────────────────────────────────────────────── */
  { code: "AL", name: "Albanie", currencyCode: "ALL", currencyName: "Lek albanais", currencySymbol: "L" },
  { code: "DE", name: "Allemagne", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "AD", name: "Andorre", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "AT", name: "Autriche", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "BE", name: "Belgique", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "BY", name: "Biélorussie", currencyCode: "BYN", currencyName: "Rouble biélorusse", currencySymbol: "Br" },
  { code: "BA", name: "Bosnie-Herzégovine", currencyCode: "BAM", currencyName: "Mark convertible", currencySymbol: "KM" },
  { code: "BG", name: "Bulgarie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "HR", name: "Croatie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "CY", name: "Chypre", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "DK", name: "Danemark", currencyCode: "DKK", currencyName: "Couronne danoise", currencySymbol: "kr" },
  { code: "ES", name: "Espagne", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "EE", name: "Estonie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "FI", name: "Finlande", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "FR", name: "France", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "GR", name: "Grèce", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "HU", name: "Hongrie", currencyCode: "HUF", currencyName: "Forint hongrois", currencySymbol: "Ft" },
  { code: "IE", name: "Irlande", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "IS", name: "Islande", currencyCode: "ISK", currencyName: "Couronne islandaise", currencySymbol: "kr" },
  { code: "IT", name: "Italie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "LV", name: "Lettonie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "LI", name: "Liechtenstein", currencyCode: "CHF", currencyName: "Franc suisse", currencySymbol: "CHF" },
  { code: "LT", name: "Lituanie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "LU", name: "Luxembourg", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "MK", name: "Macédoine du Nord", currencyCode: "MKD", currencyName: "Denar macédonien", currencySymbol: "den" },
  { code: "MT", name: "Malte", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "MD", name: "Moldavie", currencyCode: "MDL", currencyName: "Leu moldave", currencySymbol: "L" },
  { code: "MC", name: "Monaco", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "ME", name: "Monténégro", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "NO", name: "Norvège", currencyCode: "NOK", currencyName: "Couronne norvégienne", currencySymbol: "kr" },
  { code: "NL", name: "Pays-Bas", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "PL", name: "Pologne", currencyCode: "PLN", currencyName: "Zloty polonais", currencySymbol: "zł" },
  { code: "PT", name: "Portugal", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "RO", name: "Roumanie", currencyCode: "RON", currencyName: "Leu roumain", currencySymbol: "lei" },
  { code: "GB", name: "Royaume-Uni", currencyCode: "GBP", currencyName: "Livre sterling", currencySymbol: "£" },
  { code: "RU", name: "Russie", currencyCode: "RUB", currencyName: "Rouble russe", currencySymbol: "₽" },
  { code: "SM", name: "Saint-Marin", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "RS", name: "Serbie", currencyCode: "RSD", currencyName: "Dinar serbe", currencySymbol: "din" },
  { code: "SK", name: "Slovaquie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "SI", name: "Slovénie", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "SE", name: "Suède", currencyCode: "SEK", currencyName: "Couronne suédoise", currencySymbol: "kr" },
  { code: "CH", name: "Suisse", currencyCode: "CHF", currencyName: "Franc suisse", currencySymbol: "CHF" },
  { code: "CZ", name: "Tchéquie", currencyCode: "CZK", currencyName: "Couronne tchèque", currencySymbol: "Kč" },
  { code: "UA", name: "Ukraine", currencyCode: "UAH", currencyName: "Hryvnia ukrainienne", currencySymbol: "₴" },
  { code: "VA", name: "Vatican", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },
  { code: "XK", name: "Kosovo", currencyCode: "EUR", currencyName: "Euro", currencySymbol: "€" },

  /* ── Amériques ───────────────────────────────────────────────────────── */
  { code: "AG", name: "Antigua-et-Barbuda", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "AR", name: "Argentine", currencyCode: "ARS", currencyName: "Peso argentin", currencySymbol: "$" },
  { code: "BS", name: "Bahamas", currencyCode: "BSD", currencyName: "Dollar bahaméen", currencySymbol: "B$" },
  { code: "BB", name: "Barbade", currencyCode: "BBD", currencyName: "Dollar de la Barbade", currencySymbol: "Bds$" },
  { code: "BZ", name: "Belize", currencyCode: "BZD", currencyName: "Dollar bélizien", currencySymbol: "BZ$" },
  { code: "BO", name: "Bolivie", currencyCode: "BOB", currencyName: "Boliviano bolivien", currencySymbol: "Bs" },
  { code: "BR", name: "Brésil", currencyCode: "BRL", currencyName: "Réal brésilien", currencySymbol: "R$" },
  { code: "CA", name: "Canada", currencyCode: "CAD", currencyName: "Dollar canadien", currencySymbol: "C$" },
  { code: "CL", name: "Chili", currencyCode: "CLP", currencyName: "Peso chilien", currencySymbol: "$" },
  { code: "CO", name: "Colombie", currencyCode: "COP", currencyName: "Peso colombien", currencySymbol: "$" },
  { code: "CR", name: "Costa Rica", currencyCode: "CRC", currencyName: "Colón costaricain", currencySymbol: "₡" },
  { code: "CU", name: "Cuba", currencyCode: "CUP", currencyName: "Peso cubain", currencySymbol: "$" },
  { code: "DM", name: "Dominique", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "EC", name: "Équateur", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "US", name: "États-Unis", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "GD", name: "Grenade", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "GT", name: "Guatemala", currencyCode: "GTQ", currencyName: "Quetzal guatémaltèque", currencySymbol: "Q" },
  { code: "GY", name: "Guyana", currencyCode: "GYD", currencyName: "Dollar guyanien", currencySymbol: "G$" },
  { code: "HT", name: "Haïti", currencyCode: "HTG", currencyName: "Gourde haïtienne", currencySymbol: "G" },
  { code: "HN", name: "Honduras", currencyCode: "HNL", currencyName: "Lempira hondurien", currencySymbol: "L" },
  { code: "JM", name: "Jamaïque", currencyCode: "JMD", currencyName: "Dollar jamaïcain", currencySymbol: "J$" },
  { code: "MX", name: "Mexique", currencyCode: "MXN", currencyName: "Peso mexicain", currencySymbol: "MX$" },
  { code: "NI", name: "Nicaragua", currencyCode: "NIO", currencyName: "Córdoba nicaraguayen", currencySymbol: "C$" },
  { code: "PA", name: "Panamá", currencyCode: "USD", currencyName: "Dollar américain (cours légal)", currencySymbol: "$" },
  { code: "PY", name: "Paraguay", currencyCode: "PYG", currencyName: "Guaraní paraguayen", currencySymbol: "₲" },
  { code: "PE", name: "Pérou", currencyCode: "PEN", currencyName: "Sol péruvien", currencySymbol: "S/" },
  { code: "DO", name: "République dominicaine", currencyCode: "DOP", currencyName: "Peso dominicain", currencySymbol: "RD$" },
  { code: "KN", name: "Saint-Kitts-et-Nevis", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "LC", name: "Sainte-Lucie", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "VC", name: "Saint-Vincent-et-les-Grenadines", currencyCode: "XCD", currencyName: "Dollar des Caraïbes orientales", currencySymbol: "EC$" },
  { code: "SV", name: "Salvador", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "SR", name: "Suriname", currencyCode: "SRD", currencyName: "Dollar surinamais", currencySymbol: "SRD" },
  { code: "TT", name: "Trinité-et-Tobago", currencyCode: "TTD", currencyName: "Dollar de Trinité-et-Tobago", currencySymbol: "TT$" },
  { code: "UY", name: "Uruguay", currencyCode: "UYU", currencyName: "Peso uruguayen", currencySymbol: "$U" },
  { code: "VE", name: "Venezuela", currencyCode: "VES", currencyName: "Bolívar vénézuélien", currencySymbol: "Bs." },

  /* ── Asie ────────────────────────────────────────────────────────────── */
  { code: "AF", name: "Afghanistan", currencyCode: "AFN", currencyName: "Afghani afghan", currencySymbol: "AFN" },
  { code: "SA", name: "Arabie saoudite", currencyCode: "SAR", currencyName: "Riyal saoudien", currencySymbol: "SR" },
  { code: "AM", name: "Arménie", currencyCode: "AMD", currencyName: "Dram arménien", currencySymbol: "AMD" },
  { code: "AZ", name: "Azerbaïdjan", currencyCode: "AZN", currencyName: "Manat azéri", currencySymbol: "₼" },
  { code: "BH", name: "Bahreïn", currencyCode: "BHD", currencyName: "Dinar de Bahreïn", currencySymbol: "BD" },
  { code: "BD", name: "Bangladesh", currencyCode: "BDT", currencyName: "Taka bangladais", currencySymbol: "Tk" },
  { code: "BT", name: "Bhoutan", currencyCode: "BTN", currencyName: "Ngultrum bhoutanais", currencySymbol: "Nu." },
  { code: "MM", name: "Myanmar (Birmanie)", currencyCode: "MMK", currencyName: "Kyat birman", currencySymbol: "K" },
  { code: "BN", name: "Brunei", currencyCode: "BND", currencyName: "Dollar de Brunei", currencySymbol: "B$" },
  { code: "KH", name: "Cambodge", currencyCode: "KHR", currencyName: "Riel cambodgien", currencySymbol: "KHR" },
  { code: "CN", name: "Chine", currencyCode: "CNY", currencyName: "Yuan renminbi", currencySymbol: "¥" },
  { code: "KP", name: "Corée du Nord", currencyCode: "KPW", currencyName: "Won nord-coréen", currencySymbol: "₩" },
  { code: "KR", name: "Corée du Sud", currencyCode: "KRW", currencyName: "Won sud-coréen", currencySymbol: "₩" },
  { code: "AE", name: "Émirats arabes unis", currencyCode: "AED", currencyName: "Dirham des Émirats", currencySymbol: "AED" },
  { code: "GE", name: "Géorgie", currencyCode: "GEL", currencyName: "Lari géorgien", currencySymbol: "₾" },
  { code: "IN", name: "Inde", currencyCode: "INR", currencyName: "Roupie indienne", currencySymbol: "₹" },
  { code: "ID", name: "Indonésie", currencyCode: "IDR", currencyName: "Roupie indonésienne", currencySymbol: "Rp" },
  { code: "IQ", name: "Irak", currencyCode: "IQD", currencyName: "Dinar irakien", currencySymbol: "IQD" },
  { code: "IR", name: "Iran", currencyCode: "IRR", currencyName: "Rial iranien", currencySymbol: "IRR" },
  { code: "IL", name: "Israël", currencyCode: "ILS", currencyName: "Shekel israélien", currencySymbol: "₪" },
  { code: "JP", name: "Japon", currencyCode: "JPY", currencyName: "Yen japonais", currencySymbol: "¥" },
  { code: "JO", name: "Jordanie", currencyCode: "JOD", currencyName: "Dinar jordanien", currencySymbol: "JD" },
  { code: "KZ", name: "Kazakhstan", currencyCode: "KZT", currencyName: "Tenge kazakh", currencySymbol: "₸" },
  { code: "KG", name: "Kirghizistan", currencyCode: "KGS", currencyName: "Som kirghize", currencySymbol: "KGS" },
  { code: "KW", name: "Koweït", currencyCode: "KWD", currencyName: "Dinar koweïtien", currencySymbol: "KD" },
  { code: "LA", name: "Laos", currencyCode: "LAK", currencyName: "Kip laotien", currencySymbol: "₭" },
  { code: "LB", name: "Liban", currencyCode: "LBP", currencyName: "Livre libanaise", currencySymbol: "LL" },
  { code: "MY", name: "Malaisie", currencyCode: "MYR", currencyName: "Ringgit malaisien", currencySymbol: "RM" },
  { code: "MV", name: "Maldives", currencyCode: "MVR", currencyName: "Rufiyaa des Maldives", currencySymbol: "Rf" },
  { code: "MN", name: "Mongolie", currencyCode: "MNT", currencyName: "Tugrik mongol", currencySymbol: "₮" },
  { code: "NP", name: "Népal", currencyCode: "NPR", currencyName: "Roupie népalaise", currencySymbol: "Rs" },
  { code: "OM", name: "Oman", currencyCode: "OMR", currencyName: "Rial omanais", currencySymbol: "RO" },
  { code: "UZ", name: "Ouzbékistan", currencyCode: "UZS", currencyName: "Som ouzbek", currencySymbol: "UZS" },
  { code: "PK", name: "Pakistan", currencyCode: "PKR", currencyName: "Roupie pakistanaise", currencySymbol: "Rs" },
  { code: "PS", name: "Palestine", currencyCode: "ILS", currencyName: "Shekel israélien (usuel)", currencySymbol: "₪" },
  { code: "PH", name: "Philippines", currencyCode: "PHP", currencyName: "Peso philippin", currencySymbol: "₱" },
  { code: "QA", name: "Qatar", currencyCode: "QAR", currencyName: "Riyal qatari", currencySymbol: "QR" },
  { code: "SG", name: "Singapour", currencyCode: "SGD", currencyName: "Dollar de Singapour", currencySymbol: "S$" },
  { code: "LK", name: "Sri Lanka", currencyCode: "LKR", currencyName: "Roupie sri-lankaise", currencySymbol: "Rs" },
  { code: "SY", name: "Syrie", currencyCode: "SYP", currencyName: "Livre syrienne", currencySymbol: "SYP" },
  { code: "TJ", name: "Tadjikistan", currencyCode: "TJS", currencyName: "Somoni tadjik", currencySymbol: "SM" },
  { code: "TW", name: "Taïwan", currencyCode: "TWD", currencyName: "Dollar taïwanais", currencySymbol: "NT$" },
  { code: "TH", name: "Thaïlande", currencyCode: "THB", currencyName: "Baht thaïlandais", currencySymbol: "฿" },
  { code: "TL", name: "Timor oriental", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "TR", name: "Turquie", currencyCode: "TRY", currencyName: "Livre turque", currencySymbol: "₺" },
  { code: "TM", name: "Turkménistan", currencyCode: "TMT", currencyName: "Manat turkmène", currencySymbol: "TMT" },
  { code: "VN", name: "Vietnam", currencyCode: "VND", currencyName: "Dong vietnamien", currencySymbol: "₫" },
  { code: "YE", name: "Yémen", currencyCode: "YER", currencyName: "Rial yéménite", currencySymbol: "YER" },

  /* ── Océanie ─────────────────────────────────────────────────────────── */
  { code: "AU", name: "Australie", currencyCode: "AUD", currencyName: "Dollar australien", currencySymbol: "AU$" },
  { code: "FJ", name: "Fidji", currencyCode: "FJD", currencyName: "Dollar fidjien", currencySymbol: "FJ$" },
  { code: "MH", name: "Îles Marshall", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "SB", name: "Îles Salomon", currencyCode: "SBD", currencyName: "Dollar des Salomon", currencySymbol: "SI$" },
  { code: "KI", name: "Kiribati", currencyCode: "AUD", currencyName: "Dollar australien", currencySymbol: "AU$" },
  { code: "FM", name: "Micronésie", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "NR", name: "Nauru", currencyCode: "AUD", currencyName: "Dollar australien", currencySymbol: "AU$" },
  { code: "NZ", name: "Nouvelle-Zélande", currencyCode: "NZD", currencyName: "Dollar néo-zélandais", currencySymbol: "NZ$" },
  { code: "PW", name: "Palaos", currencyCode: "USD", currencyName: "Dollar américain", currencySymbol: "$" },
  { code: "PG", name: "Papouasie-Nouvelle-Guinée", currencyCode: "PGK", currencyName: "Kina papouan-néo-guinéen", currencySymbol: "K" },
  { code: "WS", name: "Samoa", currencyCode: "WST", currencyName: "Tala samoan", currencySymbol: "WS$" },
  { code: "TO", name: "Tonga", currencyCode: "TOP", currencyName: "Pa'anga tongien", currencySymbol: "T$" },
  { code: "TV", name: "Tuvalu", currencyCode: "AUD", currencyName: "Dollar australien", currencySymbol: "AU$" },
  { code: "VU", name: "Vanuatu", currencyCode: "VUV", currencyName: "Vatu vanuatu", currencySymbol: "VT" },
];

/**
 * Liste complète, triée par ordre alphabétique FRANÇAIS (locale "fr" :
 * « Émirats arabes unis » se classe à E, « Îles Salomon » à I, etc.)
 * avec drapeaux dérivés du code ISO.
 */
export const PAYS_DEVISES: PaysDevise[] = ENTREES.map((entree) => ({
  ...entree,
  flag: drapeauDepuisCode(entree.code),
})).sort((a, b) => a.name.localeCompare(b.name, "fr"));

/* ── Aides de recherche (combobox du formulaire) ───────────────────────── */

/** Minuscule + accents supprimés : « Émirats » et "emirats" deviennent égaux. */
export function normaliserRecherche(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtre instantané de la combobox : match sur le nom du pays, le code
 * devise, le nom de la devise ou le symbole (ex. "fcfa", "XOF", "bénin",
 * "euro", "cote" trouvent tous leur entrée).
 */
export function rechercherPaysDevises(requete: string): PaysDevise[] {
  const q = normaliserRecherche(requete);
  if (!q) return PAYS_DEVISES;
  return PAYS_DEVISES.filter(
    (pays) =>
      normaliserRecherche(pays.name).includes(q) ||
      pays.currencyCode.toLowerCase().includes(q) ||
      normaliserRecherche(pays.currencyName).includes(q) ||
      normaliserRecherche(pays.currencySymbol).includes(q)
  );
}

/** Retrouve un pays par son nom (insensible à la casse et aux accents). */
export function trouverPaysParNom(nom: string): PaysDevise | undefined {
  const n = normaliserRecherche(nom);
  return PAYS_DEVISES.find((pays) => normaliserRecherche(pays.name) === n);
}

/** Retrouve un pays par son code ISO 3166-1 alpha-2 (ex. "bj", "BJ"). */
export function trouverPaysParCodeIso(code: string): PaysDevise | undefined {
  const c = normaliserRecherche(code).toUpperCase();
  return PAYS_DEVISES.find((pays) => pays.code === c);
}
