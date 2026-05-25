import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { AppointmentTypesModule } from './appointment-types/appointment-types.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthLogModule } from './auth-log/auth-log.module';
import { AuthModule } from './auth/auth.module';
import { InternalSecretGuard } from './auth/guards/internal-secret.guard';
import { JwtGuard } from './auth/guards/jwt.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DepartmentsModule } from './departments/departments.module';
import { DoctorsModule } from './doctors/doctors.module';
import { HealthModule } from './health/health.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesModule } from './schedules/schedules.module';
import { SlotsModule } from './slots/slots.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuthLogModule,
    UsersModule,
    AuthModule,
    DepartmentsModule,
    DoctorsModule,
    SchedulesModule,
    AppointmentTypesModule,
    SlotsModule,
    MedicalRecordsModule,
    PatientsModule,
    AppointmentsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Guard execution order is the registration order below: internal secret
    // first (so resolve never falls through to JWT), then JWT, then per-route
    // permission check.
    { provide: APP_GUARD, useClass: InternalSecretGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
