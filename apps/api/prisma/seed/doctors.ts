/**
 * Seeds 75 DOCTOR-role users along with their `Doctor` row and one or
 * more `DoctorDepartment` affiliations.
 *
 * The first 25 (MD-0001..MD-0025) are hand-crafted specs; the remaining
 * 50 (MD-0026..MD-0075) are produced deterministically by
 * `generateAdditionalSpecs` so re-runs yield identical data. The extra
 * volume gives pagination + directory filtering enough rows to stress.
 *
 * Natural keys for idempotency:
 *   - User: `email` (unique)
 *   - Doctor: `userId` (unique 1-1 join) AND `doctorCode` (unique)
 *   - DoctorDepartment: composite unique `(doctorId, departmentId)`
 *
 * Each doctor is anchored in one primary department; many span two or
 * three departments (the additional ones are non-primary) so the
 * directory + booking flows exercise the M:N model.
 *
 * Depends on roles.ts (DOCTOR role), departments.ts (10 departments),
 * and super-admin.ts (`createdBy`).
 */
import { Gender, PrismaClient, type Department, type Doctor, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import type { SeededRoles } from './roles';

export interface SeededDoctors {
  doctors: Doctor[];
  users: User[];
}

interface DoctorSpec {
  email: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  doctorCode: string;
  gender: Gender;
  identificationNo: string;
  medicalLicenseNo: string;
  phone: string;
  primaryDepartmentName: string;
  additionalDepartmentNames: string[];
}

const HANDCRAFTED_SPECS: DoctorSpec[] = [
  {
    email: 'doctor01@gmail.com',
    firstNameEn: 'Anan',
    lastNameEn: 'Charoen',
    firstNameTh: 'อนันต์',
    lastNameTh: 'เจริญ',
    doctorCode: 'MD-0001',
    gender: Gender.MALE,
    identificationNo: '1100000000001',
    medicalLicenseNo: 'TML-100001',
    phone: '+66-2-100-0001',
    primaryDepartmentName: 'Cardiology',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor02@gmail.com',
    firstNameEn: 'Suchada',
    lastNameEn: 'Wong',
    firstNameTh: 'สุชาดา',
    lastNameTh: 'วงศ์',
    doctorCode: 'MD-0002',
    gender: Gender.FEMALE,
    identificationNo: '1100000000002',
    medicalLicenseNo: 'TML-100002',
    phone: '+66-2-100-0002',
    primaryDepartmentName: 'Cardiology',
    additionalDepartmentNames: ['Internal Medicine'],
  },
  {
    email: 'doctor03@gmail.com',
    firstNameEn: 'Niran',
    lastNameEn: 'Saetang',
    firstNameTh: 'นิรันดร์',
    lastNameTh: 'แซ่ตั้ง',
    doctorCode: 'MD-0003',
    gender: Gender.MALE,
    identificationNo: '1100000000003',
    medicalLicenseNo: 'TML-100003',
    phone: '+66-2-100-0003',
    primaryDepartmentName: 'Internal Medicine',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor04@gmail.com',
    firstNameEn: 'Praewa',
    lastNameEn: 'Boonmee',
    firstNameTh: 'แพรวา',
    lastNameTh: 'บุญมี',
    doctorCode: 'MD-0004',
    gender: Gender.FEMALE,
    identificationNo: '1100000000004',
    medicalLicenseNo: 'TML-100004',
    phone: '+66-2-100-0004',
    primaryDepartmentName: 'Pediatrics',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor05@gmail.com',
    firstNameEn: 'Kittisak',
    lastNameEn: 'Phromma',
    firstNameTh: 'กิตติศักดิ์',
    lastNameTh: 'พรหมมา',
    doctorCode: 'MD-0005',
    gender: Gender.MALE,
    identificationNo: '1100000000005',
    medicalLicenseNo: 'TML-100005',
    phone: '+66-2-100-0005',
    primaryDepartmentName: 'Pediatrics',
    additionalDepartmentNames: ['Emergency Medicine'],
  },
  {
    email: 'doctor06@gmail.com',
    firstNameEn: 'Jirayu',
    lastNameEn: 'Suksawat',
    firstNameTh: 'จิรายุ',
    lastNameTh: 'สุขสวัสดิ์',
    doctorCode: 'MD-0006',
    gender: Gender.MALE,
    identificationNo: '1100000000006',
    medicalLicenseNo: 'TML-100006',
    phone: '+66-2-100-0006',
    primaryDepartmentName: 'Orthopedics',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor07@gmail.com',
    firstNameEn: 'Apirak',
    lastNameEn: 'Thaweesin',
    firstNameTh: 'อภิรักษ์',
    lastNameTh: 'ทวีศิลป์',
    doctorCode: 'MD-0007',
    gender: Gender.MALE,
    identificationNo: '1100000000007',
    medicalLicenseNo: 'TML-100007',
    phone: '+66-2-100-0007',
    primaryDepartmentName: 'Orthopedics',
    additionalDepartmentNames: ['General Surgery'],
  },
  {
    email: 'doctor08@gmail.com',
    firstNameEn: 'Nattaya',
    lastNameEn: 'Kemkrai',
    firstNameTh: 'ณัฐญา',
    lastNameTh: 'เกมไกร',
    doctorCode: 'MD-0008',
    gender: Gender.FEMALE,
    identificationNo: '1100000000008',
    medicalLicenseNo: 'TML-100008',
    phone: '+66-2-100-0008',
    primaryDepartmentName: 'Obstetrics & Gynecology',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor09@gmail.com',
    firstNameEn: 'Wanida',
    lastNameEn: 'Inthorn',
    firstNameTh: 'วนิดา',
    lastNameTh: 'อินทร',
    doctorCode: 'MD-0009',
    gender: Gender.FEMALE,
    identificationNo: '1100000000009',
    medicalLicenseNo: 'TML-100009',
    phone: '+66-2-100-0009',
    primaryDepartmentName: 'Obstetrics & Gynecology',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor10@gmail.com',
    firstNameEn: 'Pakorn',
    lastNameEn: 'Liu',
    firstNameTh: 'ภากร',
    lastNameTh: 'หลิว',
    doctorCode: 'MD-0010',
    gender: Gender.MALE,
    identificationNo: '1100000000010',
    medicalLicenseNo: 'TML-100010',
    phone: '+66-2-100-0010',
    primaryDepartmentName: 'Dermatology',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor11@gmail.com',
    firstNameEn: 'Bua',
    lastNameEn: 'Phongphan',
    firstNameTh: 'บัว',
    lastNameTh: 'พงศ์พันธ์',
    doctorCode: 'MD-0011',
    gender: Gender.FEMALE,
    identificationNo: '1100000000011',
    medicalLicenseNo: 'TML-100011',
    phone: '+66-2-100-0011',
    primaryDepartmentName: 'Ophthalmology',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor12@gmail.com',
    firstNameEn: 'Ratchaphol',
    lastNameEn: 'Srisuk',
    firstNameTh: 'รัชพล',
    lastNameTh: 'ศรีสุข',
    doctorCode: 'MD-0012',
    gender: Gender.MALE,
    identificationNo: '1100000000012',
    medicalLicenseNo: 'TML-100012',
    phone: '+66-2-100-0012',
    primaryDepartmentName: 'Otolaryngology (ENT)',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor13@gmail.com',
    firstNameEn: 'Chayanan',
    lastNameEn: 'Khampheng',
    firstNameTh: 'ชญานันท์',
    lastNameTh: 'คำเพ็ง',
    doctorCode: 'MD-0013',
    gender: Gender.FEMALE,
    identificationNo: '1100000000013',
    medicalLicenseNo: 'TML-100013',
    phone: '+66-2-100-0013',
    primaryDepartmentName: 'General Surgery',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor14@gmail.com',
    firstNameEn: 'Tanawat',
    lastNameEn: 'Phadungrat',
    firstNameTh: 'ธนาวัฒน์',
    lastNameTh: 'ผดุงรัตน์',
    doctorCode: 'MD-0014',
    gender: Gender.MALE,
    identificationNo: '1100000000014',
    medicalLicenseNo: 'TML-100014',
    phone: '+66-2-100-0014',
    primaryDepartmentName: 'Emergency Medicine',
    additionalDepartmentNames: ['Internal Medicine'],
  },
  {
    email: 'doctor15@gmail.com',
    firstNameEn: 'Yuwadee',
    lastNameEn: 'Champa',
    firstNameTh: 'ยุวดี',
    lastNameTh: 'จำปา',
    doctorCode: 'MD-0015',
    gender: Gender.FEMALE,
    identificationNo: '1100000000015',
    medicalLicenseNo: 'TML-100015',
    phone: '+66-2-100-0015',
    primaryDepartmentName: 'Emergency Medicine',
    additionalDepartmentNames: [],
  },
  {
    email: 'doctor16@gmail.com',
    firstNameEn: 'Somsak',
    lastNameEn: 'Rattanakorn',
    firstNameTh: 'สมศักดิ์',
    lastNameTh: 'รัตนกร',
    doctorCode: 'MD-0016',
    gender: Gender.MALE,
    identificationNo: '1100000000016',
    medicalLicenseNo: 'TML-100016',
    phone: '+66-2-100-0016',
    primaryDepartmentName: 'Internal Medicine',
    additionalDepartmentNames: ['Cardiology'],
  },
  {
    email: 'doctor17@gmail.com',
    firstNameEn: 'Phimchanok',
    lastNameEn: 'Sutthichai',
    firstNameTh: 'พิมพ์ชนก',
    lastNameTh: 'สุทธิชัย',
    doctorCode: 'MD-0017',
    gender: Gender.FEMALE,
    identificationNo: '1100000000017',
    medicalLicenseNo: 'TML-100017',
    phone: '+66-2-100-0017',
    primaryDepartmentName: 'Ophthalmology',
    additionalDepartmentNames: ['Dermatology'],
  },
  {
    email: 'doctor18@gmail.com',
    firstNameEn: 'Worawit',
    lastNameEn: 'Chaiyaporn',
    firstNameTh: 'วรวิทย์',
    lastNameTh: 'ชัยพร',
    doctorCode: 'MD-0018',
    gender: Gender.MALE,
    identificationNo: '1100000000018',
    medicalLicenseNo: 'TML-100018',
    phone: '+66-2-100-0018',
    primaryDepartmentName: 'Otolaryngology (ENT)',
    additionalDepartmentNames: ['Pediatrics'],
  },
  {
    email: 'doctor19@gmail.com',
    firstNameEn: 'Decha',
    lastNameEn: 'Tantipong',
    firstNameTh: 'เดชา',
    lastNameTh: 'ตันติพงศ์',
    doctorCode: 'MD-0019',
    gender: Gender.MALE,
    identificationNo: '1100000000019',
    medicalLicenseNo: 'TML-100019',
    phone: '+66-2-100-0019',
    primaryDepartmentName: 'General Surgery',
    additionalDepartmentNames: ['Orthopedics'],
  },
  {
    email: 'doctor20@gmail.com',
    firstNameEn: 'Kanyarat',
    lastNameEn: 'Maneerat',
    firstNameTh: 'กัญญารัตน์',
    lastNameTh: 'มณีรัตน์',
    doctorCode: 'MD-0020',
    gender: Gender.FEMALE,
    identificationNo: '1100000000020',
    medicalLicenseNo: 'TML-100020',
    phone: '+66-2-100-0020',
    primaryDepartmentName: 'Obstetrics & Gynecology',
    additionalDepartmentNames: ['Internal Medicine'],
  },
  {
    email: 'doctor21@gmail.com',
    firstNameEn: 'Pongsathorn',
    lastNameEn: 'Chaichana',
    firstNameTh: 'พงศธร',
    lastNameTh: 'ชัยชนะ',
    doctorCode: 'MD-0021',
    gender: Gender.MALE,
    identificationNo: '1100000000021',
    medicalLicenseNo: 'TML-100021',
    phone: '+66-2-100-0021',
    primaryDepartmentName: 'Emergency Medicine',
    additionalDepartmentNames: ['Internal Medicine', 'Cardiology'],
  },
  {
    email: 'doctor22@gmail.com',
    firstNameEn: 'Sirinya',
    lastNameEn: 'Watcharakul',
    firstNameTh: 'สิรินยา',
    lastNameTh: 'วัชรกุล',
    doctorCode: 'MD-0022',
    gender: Gender.FEMALE,
    identificationNo: '1100000000022',
    medicalLicenseNo: 'TML-100022',
    phone: '+66-2-100-0022',
    primaryDepartmentName: 'Pediatrics',
    additionalDepartmentNames: ['Emergency Medicine', 'Internal Medicine'],
  },
  {
    email: 'doctor23@gmail.com',
    firstNameEn: 'Thanawat',
    lastNameEn: 'Yongyut',
    firstNameTh: 'ธนวัฒน์',
    lastNameTh: 'ยงยุทธ',
    doctorCode: 'MD-0023',
    gender: Gender.MALE,
    identificationNo: '1100000000023',
    medicalLicenseNo: 'TML-100023',
    phone: '+66-2-100-0023',
    primaryDepartmentName: 'General Surgery',
    additionalDepartmentNames: ['Emergency Medicine', 'Orthopedics'],
  },
  {
    email: 'doctor24@gmail.com',
    firstNameEn: 'Achara',
    lastNameEn: 'Phuwadon',
    firstNameTh: 'อัจฉรา',
    lastNameTh: 'ภูวดล',
    doctorCode: 'MD-0024',
    gender: Gender.FEMALE,
    identificationNo: '1100000000024',
    medicalLicenseNo: 'TML-100024',
    phone: '+66-2-100-0024',
    primaryDepartmentName: 'Dermatology',
    additionalDepartmentNames: ['Ophthalmology', 'Otolaryngology (ENT)'],
  },
  {
    email: 'doctor25@gmail.com',
    firstNameEn: 'Krit',
    lastNameEn: 'Aksornsri',
    firstNameTh: 'กฤต',
    lastNameTh: 'อักษรศรี',
    doctorCode: 'MD-0025',
    gender: Gender.MALE,
    identificationNo: '1100000000025',
    medicalLicenseNo: 'TML-100025',
    phone: '+66-2-100-0025',
    primaryDepartmentName: 'Internal Medicine',
    additionalDepartmentNames: ['Cardiology', 'Emergency Medicine'],
  },
];

// --- Deterministic generator for MD-0026..MD-0075 -------------------------
//
// Parallel EN / TH name pools, same length so index N pairs the matching
// transliteration. Kept at module scope per CLAUDE.md rule 2a (module-level
// constants live alongside their consumers).

const EN_FIRST_NAMES = [
  'Anan',
  'Suchada',
  'Niran',
  'Praewa',
  'Kittisak',
  'Jirayu',
  'Apirak',
  'Nattaya',
  'Wanida',
  'Pakorn',
  'Bua',
  'Ratchaphol',
  'Chayanan',
  'Tanawat',
  'Yuwadee',
  'Somsak',
  'Phimchanok',
  'Worawit',
  'Decha',
  'Kanyarat',
] as const;

const TH_FIRST_NAMES = [
  'อนันต์',
  'สุชาดา',
  'นิรันดร์',
  'แพรวา',
  'กิตติศักดิ์',
  'จิรายุ',
  'อภิรักษ์',
  'ณัฐญา',
  'วนิดา',
  'ภากร',
  'บัว',
  'รัชพล',
  'ชญานันท์',
  'ธนาวัฒน์',
  'ยุวดี',
  'สมศักดิ์',
  'พิมพ์ชนก',
  'วรวิทย์',
  'เดชา',
  'กัญญารัตน์',
] as const;

const EN_LAST_NAMES = [
  'Charoen',
  'Wong',
  'Saetang',
  'Boonmee',
  'Phromma',
  'Suksawat',
  'Thaweesin',
  'Kemkrai',
  'Inthorn',
  'Liu',
  'Phongphan',
  'Srisuk',
  'Khampheng',
  'Phadungrat',
  'Champa',
  'Rattanakorn',
  'Sutthichai',
  'Chaiyaporn',
  'Tantipong',
  'Maneerat',
] as const;

const TH_LAST_NAMES = [
  'เจริญ',
  'วงศ์',
  'แซ่ตั้ง',
  'บุญมี',
  'พรหมมา',
  'สุขสวัสดิ์',
  'ทวีศิลป์',
  'เกมไกร',
  'อินทร',
  'หลิว',
  'พงศ์พันธ์',
  'ศรีสุข',
  'คำเพ็ง',
  'ผดุงรัตน์',
  'จำปา',
  'รัตนกร',
  'สุทธิชัย',
  'ชัยพร',
  'ตันติพงศ์',
  'มณีรัตน์',
] as const;

// Primary department rotation — order matches `departments.ts` so the 10
// clinical departments receive an even baseline of doctors as the index
// walks 0..49 (5 doctors per department from this generator).
const PRIMARY_ROTATION = [
  'Cardiology',
  'Internal Medicine',
  'Pediatrics',
  'Orthopedics',
  'Obstetrics & Gynecology',
  'Dermatology',
  'Ophthalmology',
  'Otolaryngology (ENT)',
  'General Surgery',
  'Emergency Medicine',
] as const;

const GENERATED_COUNT = 50;
const FIRST_GENERATED_INDEX = 26;
// Drop firstNameTh / lastNameTh on every 5th generated doctor (idx 0, 5,
// 10, ...) so ~20% of the new rows have null Thai names — mirrors the
// existing hand-crafted spread.
const TH_NAME_DROP_MODULO = 5;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function pickAdditionalDepartments(idx: number, primary: string): string[] {
  // Deterministic affiliation count:
  //   idx % 7 === 0 → 2 extras (3 total)
  //   else idx % 4 === 0 → 1 extra
  //   else → 0 extras

  if (idx % 7 === 0) {
    return pickNonPrimaryRotated(primary, idx, 2);
  }

  if (idx % 4 === 0) {
    return pickNonPrimaryRotated(primary, idx, 1);
  }

  return [];
}

function pickNonPrimaryRotated(primary: string, idx: number, count: number): string[] {
  // Walks PRIMARY_ROTATION starting at (idx + 1) and collects the first
  // `count` distinct departments that are not the doctor's primary. This
  // guarantees no duplicate department for the same doctor (which would
  // violate the `@@unique([doctorId, departmentId])` join constraint).
  const result: string[] = [];
  let cursor = idx + 1;

  while (result.length < count) {
    const candidate = PRIMARY_ROTATION[cursor % PRIMARY_ROTATION.length]!;

    if (candidate !== primary && !result.includes(candidate)) {
      result.push(candidate);
    }

    cursor += 1;
  }

  return result;
}

function generateAdditionalSpecs(): DoctorSpec[] {
  const specs: DoctorSpec[] = [];

  for (let idx = 0; idx < GENERATED_COUNT; idx += 1) {
    const doctorNumber = idx + FIRST_GENERATED_INDEX;
    const nameIdx = idx % EN_FIRST_NAMES.length;
    const lastIdx = idx % EN_LAST_NAMES.length;
    const includeTh = idx % TH_NAME_DROP_MODULO !== 0;
    const primaryDepartmentName = PRIMARY_ROTATION[idx % PRIMARY_ROTATION.length]!;

    specs.push({
      email: `doctor${pad(doctorNumber, 2)}@gmail.com`,
      firstNameEn: EN_FIRST_NAMES[nameIdx]!,
      lastNameEn: EN_LAST_NAMES[lastIdx]!,
      firstNameTh: includeTh ? TH_FIRST_NAMES[nameIdx]! : null,
      lastNameTh: includeTh ? TH_LAST_NAMES[lastIdx]! : null,
      doctorCode: `MD-${pad(doctorNumber, 4)}`,
      gender: idx % 2 === 0 ? Gender.MALE : Gender.FEMALE,
      identificationNo: `1100000000${pad(doctorNumber, 3)}`,
      medicalLicenseNo: `TML-${pad(100000 + doctorNumber, 6)}`,
      phone: `+66-2-100-${pad(doctorNumber, 4)}`,
      primaryDepartmentName,
      additionalDepartmentNames: pickAdditionalDepartments(idx, primaryDepartmentName),
    });
  }

  return specs;
}

const SPECS: DoctorSpec[] = [...HANDCRAFTED_SPECS, ...generateAdditionalSpecs()];

export async function seedDoctors(
  prisma: PrismaClient,
  roles: SeededRoles,
  departments: Department[],
  superAdmin: User,
): Promise<SeededDoctors> {
  const departmentByName = new Map(departments.map((d) => [d.name, d]));
  const doctors: Doctor[] = [];
  const users: User[] = [];

  for (const spec of SPECS) {
    const primary = departmentByName.get(spec.primaryDepartmentName);

    if (!primary) {
      throw new Error(`Primary department "${spec.primaryDepartmentName}" not seeded`);
    }

    // Post-refactor: doctors carry exactly one department (1:1 with
    // `Department`); the M:N `doctor_departments` table is gone. The
    // `additionalDepartmentNames` field on `DoctorSpec` is preserved on
    // disk for reference but ignored by the seed — every doctor is
    // anchored at `primaryDepartmentName` only.

    const email = normalizeEmail(spec.email);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        roleId: roles.doctor.id,
        departmentId: primary.id,
      },
      create: {
        email,
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        roleId: roles.doctor.id,
        departmentId: primary.id,
        createdBy: superAdmin.id,
      },
    });

    users.push(user);

    // Post-Item-3 the doctor's department lives solely on `User.departmentId`
    // (already set on the user upsert above). The `Doctor` row no longer
    // carries a `department_id` column — both `create` and `update` payloads
    // drop it.
    const doctor = await prisma.doctor.upsert({
      where: { doctorCode: spec.doctorCode },
      update: {
        gender: spec.gender,
        identificationNo: spec.identificationNo,
        medicalLicenseNo: spec.medicalLicenseNo,
        phone: spec.phone,
      },
      create: {
        userId: user.id,
        doctorCode: spec.doctorCode,
        gender: spec.gender,
        identificationNo: spec.identificationNo,
        medicalLicenseNo: spec.medicalLicenseNo,
        phone: spec.phone,
        createdBy: superAdmin.id,
      },
    });

    doctors.push(doctor);
  }

  return { doctors, users };
}
