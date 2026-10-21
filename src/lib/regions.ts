/** Régions administratives de France métropolitaine et leurs départements (numéro du code postal). */
export const REGIONS: { name: string; departments: string[] }[] = [
  { name: 'Auvergne-Rhône-Alpes', departments: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
  { name: 'Bourgogne-Franche-Comté', departments: ['21', '25', '39', '58', '70', '71', '89', '90'] },
  { name: 'Bretagne', departments: ['22', '29', '35', '56'] },
  { name: 'Centre-Val de Loire', departments: ['18', '28', '36', '37', '41', '45'] },
  { name: 'Corse', departments: ['20'] },
  { name: 'Grand Est', departments: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
  { name: 'Hauts-de-France', departments: ['02', '59', '60', '62', '80'] },
  { name: 'Île-de-France', departments: ['75', '77', '78', '91', '92', '93', '94', '95'] },
  { name: 'Normandie', departments: ['14', '27', '50', '61', '76'] },
  { name: 'Nouvelle-Aquitaine', departments: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
  { name: 'Occitanie', departments: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
  { name: 'Pays de la Loire', departments: ['44', '49', '53', '72', '85'] },
  { name: 'Provence-Alpes-Côte d’Azur', departments: ['04', '05', '06', '13', '83', '84'] },
];

const BY_DEPARTMENT = new Map(REGIONS.flatMap((r) => r.departments.map((d) => [d, r.name] as const)));

/** Région administrative d'un numéro de département (« 49 » → « Pays de la Loire »). */
export const regionOfDepartment = (code: string | null) => (code ? (BY_DEPARTMENT.get(code) ?? null) : null);

/** Texte comparable pour la recherche : minuscules, sans accents ni apostrophes typographiques. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .trim();
