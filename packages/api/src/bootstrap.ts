import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    {
      transform(value: unknown, metadata: { type: string }) {
        const visit = (v: unknown, key?: string): void => {
          if (v === null && key !== 'purchaseIntentRating')
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              message: 'Omit optional fields instead of sending null.',
            });
          if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
        };
        if (metadata.type === 'body') visit(value);
        return value;
      },
    },
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('StudentSys API')
      .setDescription(
        'Timetable, trial booking, teacher feedback and private administrator follow-up.',
      )
      .setVersion('0.2.0')
      .addCookieAuth('student_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  return { app, document };
}
