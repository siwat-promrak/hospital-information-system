import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class DoctorDepartmentRefDto {
  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  id!: string;

  @ApiProperty({ example: 'Cardiology' })
  name!: string;
}

const GENDER_VALUES = Object.values(Gender);

export class DoctorResponseDto {
  @ApiProperty({ example: '4f3e2a10-1234-5678-9abc-deadbeef1234' })
  id!: string;

  @ApiProperty({ example: 'MD-0001' })
  doctorCode!: string;

  @ApiProperty({ example: 'Anna' })
  firstNameEn!: string;

  @ApiProperty({ example: 'Visit' })
  lastNameEn!: string;

  @ApiProperty({ example: 'Anna Visit' })
  fullName!: string;

  @ApiProperty({ example: Gender.FEMALE, enum: GENDER_VALUES, nullable: true })
  gender!: Gender | null;

  @ApiProperty({ example: 'aa3d2f17-3c0b-4b4f-a3e8-31f2bbb55bd9' })
  departmentId!: string;

  @ApiProperty({ type: DoctorDepartmentRefDto })
  department!: DoctorDepartmentRefDto;
}

export class DoctorDetailResponseDto extends DoctorResponseDto {
  @ApiProperty({ example: '+66-2-555-1212' })
  phone!: string;

  @ApiProperty({ example: 'MED-2025-0001' })
  medicalLicenseNo!: string;

  @ApiProperty({
    example: '123 Sukhumvit Rd, Bangkok 10110',
    nullable: true,
    required: false,
  })
  address!: string | null;

  @ApiProperty({
    example: 3,
    description: 'Number of active schedule rows owned by the doctor.',
  })
  scheduleCount!: number;
}
