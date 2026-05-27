/**
 * Seeds 1000 Patient rows as pure records (no User link in the post-RBAC
 * model — patients do not sign in in P0). The first 10 (HN 26000001..
 * 26000010) are hand-crafted; the remaining 990 (HN 26000011..26001000)
 * are produced deterministically by `generateAdditionalSpecs` so re-runs
 * yield identical data. The extra volume gives patient pagination +
 * search filtering enough rows to stress.
 *
 * Schema notes:
 *   - `hn` is 8-digit numeric `<YY><sequence>` (e.g. `26000001`). The
 *     Postgres CHECK constraint added in the init migration enforces
 *     `^[0-9]{7,9}$`.
 *   - `firstNameEn` / `lastNameEn` are required; `firstNameTh` /
 *     `lastNameTh` are nullable and populated for about 70% of generated
 *     rows (~30% with `null`) to exercise the optional Thai-name path.
 *   - `email` is optional in the schema; here every seeded patient has
 *     one (`patient<N>@mailsac.com`) so end-to-end notification flows can
 *     be exercised against mailsac without a real inbox.
 *
 * `createdBy` is the super-admin so re-runs stay deterministic. Natural
 * key is `hn` (unique).
 */
import dayjs from 'dayjs';
import {
  BloodGroup,
  Gender,
  PrismaClient,
  type Patient,
  type User,
} from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

import { getUniqueName } from './_name-pool';

interface PatientSpec {
  hn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  email: string;
  dateOfBirth: Date;
  gender: Gender;
  bloodGroup: BloodGroup;
  identificationNo: string;
  phone: string;
  emergencyPersonName: string;
  emergencyPersonRelation: string;
  emergencyPersonPhone: string;
  address: string;
}

const HANDCRAFTED_SPECS: PatientSpec[] = [
  {
    hn: '26000001',
    firstNameEn: 'Suda',
    lastNameEn: 'Charoenwong',
    firstNameTh: 'สุดา',
    lastNameTh: 'เจริญวงศ์',
    email: 'patient1@mailsac.com',
    dateOfBirth: new Date('1990-01-15'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.O_POSITIVE,
    identificationNo: '1100400123456',
    phone: '+66-81-000-0001',
    emergencyPersonName: 'Somsri Charoenwong',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0001',
    address: '12 Soi 1, Lat Phrao Rd, Bangkok 10230',
  },
  {
    hn: '26000002',
    firstNameEn: 'John',
    lastNameEn: 'Miller',
    firstNameTh: null,
    lastNameTh: null,
    email: 'patient2@mailsac.com',
    dateOfBirth: new Date('1985-06-20'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.A_POSITIVE,
    identificationNo: 'P12345678',
    phone: '+66-81-000-0002',
    emergencyPersonName: 'Jane Miller',
    emergencyPersonRelation: 'Spouse',
    emergencyPersonPhone: '+66-81-100-0002',
    address: '34 Soi 2, Ratchada Rd, Bangkok 10310',
  },
  {
    hn: '26000003',
    firstNameEn: 'Nattapong',
    lastNameEn: 'Phongphan',
    firstNameTh: 'ณัฐพงศ์',
    lastNameTh: 'พงษ์พันธ์',
    email: 'patient3@mailsac.com',
    dateOfBirth: new Date('1998-11-02'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.B_NEGATIVE,
    identificationNo: '1100400345678',
    phone: '+66-81-000-0003',
    emergencyPersonName: 'Suda Phongphan',
    emergencyPersonRelation: 'Sister',
    emergencyPersonPhone: '+66-81-100-0003',
    address: '56 Soi 3, Phetchaburi Rd, Bangkok 10400',
  },
  {
    hn: '26000004',
    firstNameEn: 'Linda',
    lastNameEn: 'Foster',
    firstNameTh: null,
    lastNameTh: null,
    email: 'patient4@mailsac.com',
    dateOfBirth: new Date('1972-03-30'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.AB_POSITIVE,
    identificationNo: '1100400456789',
    phone: '+66-81-000-0004',
    emergencyPersonName: 'Marcus Foster',
    emergencyPersonRelation: 'Son',
    emergencyPersonPhone: '+66-81-100-0004',
    address: '78 Soi 4, Rama 9 Rd, Bangkok 10310',
  },
  {
    hn: '26000005',
    firstNameEn: 'Krit',
    lastNameEn: 'Saengthong',
    firstNameTh: 'กฤษณ์',
    lastNameTh: 'แสงทอง',
    email: 'patient5@mailsac.com',
    dateOfBirth: new Date('2001-07-12'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.O_NEGATIVE,
    identificationNo: '1100400567890',
    phone: '+66-81-000-0005',
    emergencyPersonName: 'Wipa Saengthong',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0005',
    address: '90 Soi 5, Sathorn Rd, Bangkok 10120',
  },
  {
    hn: '26000006',
    firstNameEn: 'Henry',
    lastNameEn: 'Lee',
    firstNameTh: null,
    lastNameTh: null,
    email: 'patient6@mailsac.com',
    dateOfBirth: new Date('1960-12-05'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.UNKNOWN,
    identificationNo: 'P87654321',
    phone: '+66-81-000-0006',
    emergencyPersonName: 'Grace Lee',
    emergencyPersonRelation: 'Daughter',
    emergencyPersonPhone: '+66-81-100-0006',
    address: '11 Soi 6, Asoke Rd, Bangkok 10110',
  },
  {
    hn: '26000007',
    firstNameEn: 'Pranee',
    lastNameEn: 'Boonmee',
    firstNameTh: 'ปราณี',
    lastNameTh: 'บุญมี',
    email: 'patient7@mailsac.com',
    dateOfBirth: new Date('1993-09-18'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.A_NEGATIVE,
    identificationNo: '1100400789012',
    phone: '+66-81-000-0007',
    emergencyPersonName: 'Anan Boonmee',
    emergencyPersonRelation: 'Brother',
    emergencyPersonPhone: '+66-81-100-0007',
    address: '22 Soi 7, Thonglor, Bangkok 10110',
  },
  {
    hn: '26000008',
    firstNameEn: 'Emily',
    lastNameEn: 'Carter',
    firstNameTh: null,
    lastNameTh: null,
    email: 'patient8@mailsac.com',
    dateOfBirth: new Date('1988-04-22'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.B_POSITIVE,
    identificationNo: '1100400890123',
    phone: '+66-81-000-0008',
    emergencyPersonName: 'Robert Carter',
    emergencyPersonRelation: 'Brother',
    emergencyPersonPhone: '+66-81-100-0008',
    address: '33 Soi 8, Ekkamai, Bangkok 10110',
  },
  {
    hn: '26000009',
    firstNameEn: 'Somsak',
    lastNameEn: 'Tantipanya',
    firstNameTh: 'สมศักดิ์',
    lastNameTh: 'ตันติปัญญา',
    email: 'patient9@mailsac.com',
    dateOfBirth: new Date('1979-02-11'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.AB_NEGATIVE,
    identificationNo: 'P11122233',
    phone: '+66-81-000-0009',
    emergencyPersonName: 'Pat Tantipanya',
    emergencyPersonRelation: 'Spouse',
    emergencyPersonPhone: '+66-81-100-0009',
    address: '44 Soi 9, Bang Na, Bangkok 10260',
  },
  {
    hn: '26000010',
    firstNameEn: 'Mali',
    lastNameEn: 'Suksawat',
    firstNameTh: null,
    lastNameTh: null,
    email: 'patient10@mailsac.com',
    dateOfBirth: new Date('2003-08-09'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.UNKNOWN,
    identificationNo: '1100400112233',
    phone: '+66-81-000-0010',
    emergencyPersonName: 'Pim Suksawat',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0010',
    address: '55 Soi 10, Bang Sue, Bangkok 10800',
  },
];

// --- Deterministic generator for HN 26000011..26001000 -------------------
//
// Names come from the shared pool in `_name-pool.ts` at indices
// 300..1289 (reserved range for generated patients). The ID / phone /
// HN walks are deterministic so re-running the seed reproduces the same
// rows.

const GENERATED_COUNT = 990;
const FIRST_GENERATED_HN_SUFFIX = 11;
const FIRST_GENERATED_EMAIL_NUMBER = 11;
const PATIENT_NAME_POOL_OFFSET = 300;

const BLOOD_GROUPS: BloodGroup[] = [
  BloodGroup.A_POSITIVE,
  BloodGroup.A_NEGATIVE,
  BloodGroup.B_POSITIVE,
  BloodGroup.B_NEGATIVE,
  BloodGroup.AB_POSITIVE,
  BloodGroup.AB_NEGATIVE,
  BloodGroup.O_POSITIVE,
  BloodGroup.O_NEGATIVE,
  BloodGroup.UNKNOWN,
];

const RELATIONS = ['Father', 'Mother', 'Spouse', 'Sibling', 'Child'];

const ROADS = [
  'Sukhumvit Rd',
  'Silom Rd',
  'Sathorn Rd',
  'Phaholyothin Rd',
  'Ratchadaphisek Rd',
  'Lat Phrao Rd',
  'Rama 4 Rd',
  'Rama 9 Rd',
  'Asoke Rd',
  'Charoen Krung Rd',
];

const POSTCODES = [
  '10110',
  '10120',
  '10310',
  '10400',
  '10500',
  '10600',
  '10800',
  '10230',
  '10900',
  '10260',
];

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function generateAdditionalSpecs(): PatientSpec[] {
  const specs: PatientSpec[] = [];
  const dobBase = dayjs('1950-01-01');

  for (let idx = 0; idx < GENERATED_COUNT; idx += 1) {
    const hnSuffix = idx + FIRST_GENERATED_HN_SUFFIX;
    const emailNumber = idx + FIRST_GENERATED_EMAIL_NUMBER;
    const name = getUniqueName(PATIENT_NAME_POOL_OFFSET + idx);
    // Offset the emergency-contact name in the same pool so it doesn't
    // collide with the patient's own name (and stays disjoint from
    // every hand-crafted row).
    const contactName = getUniqueName(PATIENT_NAME_POOL_OFFSET + idx + 1500);
    const gender = idx % 2 === 0 ? Gender.MALE : Gender.FEMALE;
    const bloodGroup = BLOOD_GROUPS[idx % BLOOD_GROUPS.length]!;
    const relation = RELATIONS[idx % RELATIONS.length]!;
    const road = ROADS[idx % ROADS.length]!;
    const postcode = POSTCODES[idx % POSTCODES.length]!;
    const dateOfBirth = dobBase.add(idx * 17, 'day').toDate();

    // `identificationNo` walks 13 digits starting from '1100500000000'.
    // Distinct from every hand-crafted ID (those use the '110040...' or
    // 'P########' prefix patterns) so no collision is possible.
    const identificationNo = `1100${pad(500000 + idx, 9)}`;
    // Phone walks `+66-81-NNN-NNNN` deterministically. Hand-crafted
    // patients use `+66-81-000-####` so the '500'+ prefix here keeps
    // every generated phone disjoint from the canonical 10.
    const phoneSuffix = 500 + idx;
    const phoneA = Math.floor(phoneSuffix / 10);
    const phoneB = idx % 10;
    const phone = `+66-81-${pad(phoneA, 3)}-${pad((phoneSuffix * 7) % 10000, 4)}`;
    const emergencyPhone = `+66-82-${pad(phoneA, 3)}-${pad((phoneSuffix * 7 + phoneB) % 10000, 4)}`;

    specs.push({
      hn: `2600${pad(hnSuffix, 4)}`,
      firstNameEn: name.firstNameEn,
      lastNameEn: name.lastNameEn,
      firstNameTh: name.firstNameTh,
      lastNameTh: name.lastNameTh,
      email: `patient${emailNumber}@mailsac.com`,
      dateOfBirth,
      gender,
      bloodGroup,
      identificationNo,
      phone,
      emergencyPersonName: `${contactName.firstNameEn} ${contactName.lastNameEn}`,
      emergencyPersonRelation: relation,
      emergencyPersonPhone: emergencyPhone,
      address: `${idx + 1} Soi ${(idx % 50) + 1}, ${road}, Bangkok ${postcode}`,
    });
  }

  return specs;
}

const SPECS: PatientSpec[] = [...HANDCRAFTED_SPECS, ...generateAdditionalSpecs()];

export async function seedPatients(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<Patient[]> {
  const created: Patient[] = [];

  for (const spec of SPECS) {
    const email = normalizeEmail(spec.email);
    const patient = await prisma.patient.upsert({
      where: { hn: spec.hn },
      update: {
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        email,
        dateOfBirth: spec.dateOfBirth,
        gender: spec.gender,
        bloodGroup: spec.bloodGroup,
        identificationNo: spec.identificationNo,
        phone: spec.phone,
        emergencyPersonName: spec.emergencyPersonName,
        emergencyPersonRelation: spec.emergencyPersonRelation,
        emergencyPersonPhone: spec.emergencyPersonPhone,
        address: spec.address,
      },
      create: {
        hn: spec.hn,
        firstNameEn: spec.firstNameEn,
        lastNameEn: spec.lastNameEn,
        firstNameTh: spec.firstNameTh,
        lastNameTh: spec.lastNameTh,
        email,
        dateOfBirth: spec.dateOfBirth,
        gender: spec.gender,
        bloodGroup: spec.bloodGroup,
        identificationNo: spec.identificationNo,
        phone: spec.phone,
        emergencyPersonName: spec.emergencyPersonName,
        emergencyPersonRelation: spec.emergencyPersonRelation,
        emergencyPersonPhone: spec.emergencyPersonPhone,
        address: spec.address,
        createdBy: superAdmin.id,
      },
    });

    created.push(patient);
  }

  return created;
}
