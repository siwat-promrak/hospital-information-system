/**
 * Seeds 5 Doctor rows 1-1 with the DOCTOR-role users from users.ts and
 * distributed 2/2/1 across the departments from departments.ts. Depends on
 * users.ts (DOCTOR users) and departments.ts. Natural key is `doctorCode`
 * (unique), used by doctor-schedules.ts and appointments.ts.
 */
import { Gender, PrismaClient, type Department, type Doctor, type User } from '@prisma/client';

import { normalizeEmail } from '../../src/common/normalize-email';

interface DoctorSpec {
  userEmail: string;
  departmentName: string;
  doctorCode: string;
  medicalLicenseNo: string;
  gender: Gender | null;
  phone: string;
  address: string | null;
}

const SPECS: DoctorSpec[] = [
  {
    userEmail: 'doctor.somchai@gmail.com',
    departmentName: 'Cardiology',
    doctorCode: 'MD-0001',
    medicalLicenseNo: 'MED-2026-0001',
    gender: Gender.MALE,
    phone: '+66-2-100-0001',
    address: '123 Sukhumvit Rd, Bangkok 10110',
  },
  {
    userEmail: 'doctor.alice@gmail.com',
    departmentName: 'Cardiology',
    doctorCode: 'MD-0002',
    medicalLicenseNo: 'MED-2026-0002',
    gender: Gender.FEMALE,
    phone: '+66-2-100-0002',
    address: null,
  },
  {
    userEmail: 'doctor.nattapong@gmail.com',
    departmentName: 'Internal Medicine',
    doctorCode: 'MD-0003',
    medicalLicenseNo: 'MED-2026-0003',
    gender: Gender.MALE,
    phone: '+66-2-100-0003',
    address: '45 Phaholyothin Rd, Bangkok 10400',
  },
  {
    userEmail: 'doctor.ben@gmail.com',
    departmentName: 'Internal Medicine',
    doctorCode: 'MD-0004',
    medicalLicenseNo: 'MED-2026-0004',
    gender: null,
    phone: '+66-2-100-0004',
    address: null,
  },
  {
    userEmail: 'doctor.carla@gmail.com',
    departmentName: 'Pediatrics',
    doctorCode: 'MD-0005',
    medicalLicenseNo: 'MED-2026-0005',
    gender: Gender.FEMALE,
    phone: '+66-2-100-0005',
    address: '88 Silom Rd, Bangkok 10500',
  },
];

export async function seedDoctors(
  prisma: PrismaClient,
  doctorUsers: User[],
  departments: Department[],
  superAdmin: User,
): Promise<Doctor[]> {
  const usersByEmail = new Map(doctorUsers.map((u) => [u.email, u]));
  const departmentsByName = new Map(departments.map((d) => [d.name, d]));

  const created: Doctor[] = [];

  for (const spec of SPECS) {
    const user = usersByEmail.get(normalizeEmail(spec.userEmail));

    if (!user) {
      throw new Error(`Seed referenced unknown doctor user email: ${spec.userEmail}`);
    }

    const department = departmentsByName.get(spec.departmentName);

    if (!department) {
      throw new Error(`Seed referenced unknown department: ${spec.departmentName}`);
    }

    const doctor = await prisma.doctor.upsert({
      where: { doctorCode: spec.doctorCode },
      update: {
        userId: user.id,
        departmentId: department.id,
        medicalLicenseNo: spec.medicalLicenseNo,
        gender: spec.gender,
        phone: spec.phone,
        address: spec.address,
      },
      create: {
        userId: user.id,
        departmentId: department.id,
        doctorCode: spec.doctorCode,
        medicalLicenseNo: spec.medicalLicenseNo,
        gender: spec.gender,
        phone: spec.phone,
        address: spec.address,
        createdBy: superAdmin.id,
      },
    });

    created.push(doctor);
  }

  return created;
}
