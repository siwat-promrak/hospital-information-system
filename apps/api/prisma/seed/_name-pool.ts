/**
 * Shared name pool for the deterministic seeders (generated doctors,
 * nurses, pharmacy users, generated patients).
 *
 * Contract:
 *   - `EN_FIRST_NAMES` and `EN_LAST_NAMES` are each ~50 entries long.
 *   - `TH_FIRST_NAMES` / `TH_LAST_NAMES` are parallel arrays of the same
 *     length; ~30% of entries are `null` to exercise the optional-Thai-name
 *     path (mirrors the existing hand-crafted spread in `doctors.ts` and
 *     `patients.ts`).
 *   - `getUniqueName(globalIndex)` walks the pools so the
 *     (firstNameEn, lastNameEn) pair is unique across every caller — see
 *     index allocation table below.
 *
 * Disjointness with hand-crafted entries:
 *
 *   No EN first name AND no EN last name in this pool appears in any of
 *   the hand-crafted specs (admins / nurse / MRO / pharmacy in `users.ts`,
 *   the 25 hand-crafted doctors in `doctors.ts`, the 10 patients in
 *   `patients.ts`, the super-admin in `super-admin.ts`). Because BOTH
 *   axes are disjoint, every generated `firstNameEn lastNameEn` combo is
 *   automatically distinct from every hand-crafted full name.
 *
 *   Reserved hand-crafted first names (forbidden in this pool):
 *     Super, Sarah, Kanya, Pim, Daniel, Mali, Anan, Suchada, Niran,
 *     Praewa, Kittisak, Jirayu, Apirak, Nattaya, Wanida, Pakorn, Bua,
 *     Ratchaphol, Chayanan, Tanawat, Yuwadee, Somsak, Phimchanok,
 *     Worawit, Decha, Kanyarat, Pongsathorn, Sirinya, Thanawat, Achara,
 *     Krit, Suda, John, Nattapong, Linda, Henry, Pranee, Emily.
 *
 *   Reserved hand-crafted last names (forbidden in this pool):
 *     Admin, Smith, Ratchaphon, Sukjai, Park, Saengthong, Charoen, Wong,
 *     Saetang, Boonmee, Phromma, Suksawat, Thaweesin, Kemkrai, Inthorn,
 *     Liu, Phongphan, Srisuk, Khampheng, Phadungrat, Champa, Rattanakorn,
 *     Sutthichai, Chaiyaporn, Tantipong, Maneerat, Chaichana, Watcharakul,
 *     Yongyut, Phuwadon, Aksornsri, Charoenwong, Miller, Foster, Lee,
 *     Carter, Tantipanya.
 *
 * Index allocation (callers reserve non-overlapping ranges so no two
 * generated entries collide on the same global index):
 *
 *   Doctors generated (75 entries)   : indices 0..74
 *   Nurses generated (99 entries)    : indices 100..198
 *   Pharmacy generated (19 entries)  : indices 200..218
 *   Patients generated (990 entries) : indices 300..1289
 *
 *   Gaps between ranges leave headroom for future role expansion.
 */

export const EN_FIRST_NAMES = [
  'Akarat',
  'Banchong',
  'Chanida',
  'Darin',
  'Ekapong',
  'Fa',
  'Goong',
  'Hatsadin',
  'Intira',
  'Jaruwan',
  'Kraisorn',
  'Lawan',
  'Manop',
  'Naree',
  'Orawan',
  'Phairoj',
  'Quanchai',
  'Rojana',
  'Saksit',
  'Thanin',
  'Ubon',
  'Veerapong',
  'Watcharin',
  'Xanith',
  'Yothin',
  'Zola',
  'Aroon',
  'Benja',
  'Chalerm',
  'Duangporn',
  'Earm',
  'Fuangfa',
  'Gulap',
  'Hathai',
  'Issara',
  'Jutamas',
  'Kamthorn',
  'Lalita',
  'Montri',
  'Nopadol',
  'Onuma',
  'Pichet',
  'Rangsiman',
  'Sopit',
  'Tossapon',
  'Urai',
  'Visut',
  'Wirawan',
  'Yutthana',
  'Zarah',
] as const;

export const TH_FIRST_NAMES: Array<string | null> = [
  'อัครรัตน์',
  'บรรจง',
  'ชนิดา',
  'ดารินทร์',
  'เอกพงศ์',
  null,
  null,
  'หัสดิน',
  'อินทิรา',
  'จารุวรรณ',
  'ไกรสร',
  'ลาวัณย์',
  'มานพ',
  'นารี',
  'อรวรรณ',
  null,
  'ขวัญชัย',
  'โรจนา',
  'ศักดิ์สิทธิ์',
  'ธานินทร์',
  null,
  'วีรพงศ์',
  'วัชรินทร์',
  null,
  'โยธิน',
  null,
  'อรุณ',
  'เบญจา',
  'เฉลิม',
  'ดวงพร',
  null,
  'เฟื่องฟ้า',
  null,
  'หทัย',
  'อิสระ',
  'จุฑามาส',
  'กำธร',
  'ลลิตา',
  'มนตรี',
  null,
  'อรอุมา',
  'พิเชษฐ์',
  'รังสิมันต์',
  'โสภิต',
  'ทศพล',
  null,
  'วิสุทธิ์',
  'วิรวรรณ',
  'ยุทธนา',
  null,
];

export const EN_LAST_NAMES = [
  'Aiyara',
  'Bunyasarn',
  'Chaopraya',
  'Disakul',
  'Eosakul',
  'Faengfu',
  'Gantharakorn',
  'Hongsa',
  'Indrasak',
  'Jongjit',
  'Kraisaeng',
  'Limthongkul',
  'Mektrirat',
  'Nimmanhaemin',
  'Osathanond',
  'Phaichit',
  'Quanruedi',
  'Rakkiat',
  'Sahapong',
  'Thienthong',
  'Ubonchai',
  'Vorachat',
  'Wisetsiri',
  'Xathong',
  'Yommarat',
  'Zaengarun',
  'Aphaisuwan',
  'Bualuang',
  'Chanthaburi',
  'Duangruedi',
  'Embunchu',
  'Fongkaew',
  'Greephol',
  'Hutapoom',
  'Inthajak',
  'Jirakraisiri',
  'Khunaporn',
  'Lertpaitoon',
  'Munintorn',
  'Nakthong',
  'Opasanon',
  'Phuangphet',
  'Rangrojkul',
  'Sangnak',
  'Tepwong',
  'Ulitthichai',
  'Vongthawee',
  'Wirojrat',
  'Yotcharoen',
  'Zumthong',
] as const;

export const TH_LAST_NAMES: Array<string | null> = [
  'อัยยรา',
  'บุณยศาสตร์',
  'เจ้าพระยา',
  null,
  'เอกสกุล',
  'แฟงฟู',
  null,
  'หงษา',
  'อินทรศักดิ์',
  'จงจิตต์',
  null,
  'ลิ้มทองกุล',
  'เมฆตรีรัตน์',
  'นิมมานเหมินทร์',
  null,
  'พ่ายชิต',
  'ขวัญฤดี',
  'รักเกียรติ',
  null,
  'เทียนทอง',
  'อุบลชัย',
  'วรชาติ',
  'วิเศษศิริ',
  null,
  'ยอมรัตน์',
  'แสงอรุณ',
  null,
  'บัวหลวง',
  'จันทบุรี',
  'ดวงฤดี',
  null,
  'ฟองแก้ว',
  'กรีพล',
  null,
  'อินทรจักร',
  'จิรเกษมศิริ',
  'คุณาภรณ์',
  null,
  'มุนินทร์',
  'นาคทอง',
  null,
  'พวงเพชร',
  'รังโรจน์กุล',
  'แสงนาค',
  null,
  'อุลิตธิชัย',
  'วงศ์ทวี',
  'วิโรจน์รัตน์',
  null,
  'ซุ่มทอง',
];

export interface NameTuple {
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
}

/**
 * Resolve a deterministic name tuple for the given global index. Walks
 * the first-name axis first so consecutive indices vary by first name
 * (more "natural" looking when scrolling a list), and steps the last
 * name every FIRST_NAMES rows.
 *
 * With 50 × 50 = 2500 unique (first, last) combos available and the
 * highest caller index at 1289, no two callers ever resolve to the same
 * pair.
 */
export function getUniqueName(globalIndex: number): NameTuple {
  const firstIdx = globalIndex % EN_FIRST_NAMES.length;
  const lastIdx = Math.floor(globalIndex / EN_FIRST_NAMES.length) % EN_LAST_NAMES.length;

  return {
    firstNameEn: EN_FIRST_NAMES[firstIdx]!,
    lastNameEn: EN_LAST_NAMES[lastIdx]!,
    firstNameTh: TH_FIRST_NAMES[firstIdx] ?? null,
    lastNameTh: TH_LAST_NAMES[lastIdx] ?? null,
  };
}
