/**
 * Seeds 10 Patient rows as pure records (no User link in the post-RBAC
 * model — patients do not sign in in P0). Genders balanced 5 MALE +
 * 5 FEMALE; blood groups mix common types with UNKNOWN to exercise the
 * default. `createdBy` is the super-admin so re-runs stay deterministic.
 * Natural key is `hn` (unique), used by appointments.ts.
 */
import {
  BloodGroup,
  Gender,
  PrismaClient,
  type Patient,
  type User,
} from '@prisma/client';

interface PatientSpec {
  hn: string;
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

const SPECS: PatientSpec[] = [
  {
    hn: 'HN-2026-0001',
    dateOfBirth: new Date('1990-01-15'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.O_POSITIVE,
    identificationNo: '1100400123456',
    phone: '+66-81-000-0001',
    emergencyPersonName: 'Somsri One',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0001',
    address: '12 Soi 1, Lat Phrao Rd, Bangkok 10230',
  },
  {
    hn: 'HN-2026-0002',
    dateOfBirth: new Date('1985-06-20'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.A_POSITIVE,
    identificationNo: 'P12345678',
    phone: '+66-81-000-0002',
    emergencyPersonName: 'Jane Two',
    emergencyPersonRelation: 'Spouse',
    emergencyPersonPhone: '+66-81-100-0002',
    address: '34 Soi 2, Ratchada Rd, Bangkok 10310',
  },
  {
    hn: 'HN-2026-0003',
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
    hn: 'HN-2026-0004',
    dateOfBirth: new Date('1972-03-30'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.AB_POSITIVE,
    identificationNo: '1100400456789',
    phone: '+66-81-000-0004',
    emergencyPersonName: 'Marcus Four',
    emergencyPersonRelation: 'Son',
    emergencyPersonPhone: '+66-81-100-0004',
    address: '78 Soi 4, Rama 9 Rd, Bangkok 10310',
  },
  {
    hn: 'HN-2026-0005',
    dateOfBirth: new Date('2001-07-12'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.O_NEGATIVE,
    identificationNo: '1100400567890',
    phone: '+66-81-000-0005',
    emergencyPersonName: 'Wipa Charoen',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0005',
    address: '90 Soi 5, Sathorn Rd, Bangkok 10120',
  },
  {
    hn: 'HN-2026-0006',
    dateOfBirth: new Date('1960-12-05'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.UNKNOWN,
    identificationNo: 'P87654321',
    phone: '+66-81-000-0006',
    emergencyPersonName: 'Lee Six',
    emergencyPersonRelation: 'Friend',
    emergencyPersonPhone: '+66-81-100-0006',
    address: '11 Soi 6, Asoke Rd, Bangkok 10110',
  },
  {
    hn: 'HN-2026-0007',
    dateOfBirth: new Date('1993-09-18'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.A_NEGATIVE,
    identificationNo: '1100400789012',
    phone: '+66-81-000-0007',
    emergencyPersonName: 'Kim Seven',
    emergencyPersonRelation: 'Sister',
    emergencyPersonPhone: '+66-81-100-0007',
    address: '22 Soi 7, Thonglor, Bangkok 10110',
  },
  {
    hn: 'HN-2026-0008',
    dateOfBirth: new Date('1988-04-22'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.B_POSITIVE,
    identificationNo: '1100400890123',
    phone: '+66-81-000-0008',
    emergencyPersonName: 'Anan Boonmee',
    emergencyPersonRelation: 'Brother',
    emergencyPersonPhone: '+66-81-100-0008',
    address: '33 Soi 8, Ekkamai, Bangkok 10110',
  },
  {
    hn: 'HN-2026-0009',
    dateOfBirth: new Date('1979-02-11'),
    gender: Gender.MALE,
    bloodGroup: BloodGroup.AB_NEGATIVE,
    identificationNo: 'P11122233',
    phone: '+66-81-000-0009',
    emergencyPersonName: 'Pat Nine',
    emergencyPersonRelation: 'Spouse',
    emergencyPersonPhone: '+66-81-100-0009',
    address: '44 Soi 9, Bang Na, Bangkok 10260',
  },
  {
    hn: 'HN-2026-0010',
    dateOfBirth: new Date('2003-08-09'),
    gender: Gender.FEMALE,
    bloodGroup: BloodGroup.UNKNOWN,
    identificationNo: '1100400112233',
    phone: '+66-81-000-0010',
    emergencyPersonName: 'Pim Ten',
    emergencyPersonRelation: 'Mother',
    emergencyPersonPhone: '+66-81-100-0010',
    address: '55 Soi 10, Bang Sue, Bangkok 10800',
  },
];

export async function seedPatients(
  prisma: PrismaClient,
  superAdmin: User,
): Promise<Patient[]> {
  const created: Patient[] = [];

  for (const spec of SPECS) {
    const patient = await prisma.patient.upsert({
      where: { hn: spec.hn },
      update: {
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
