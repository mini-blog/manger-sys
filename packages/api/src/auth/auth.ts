import { USER_ROLES, type UserRole, type UserIdentity, type AuthSession } from '@student/common';
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { settings } from '../config';
import { hashPassword, hashToken, verifyPassword } from './password';

export class UserDto implements UserIdentity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: USER_ROLES }) role!: UserRole;
}
export class AuthDto implements AuthSession {
  @ApiProperty({ type: UserDto }) user!: UserDto;
  @ApiProperty() csrfToken!: string;
}
class LoginDto {
  @ApiProperty({ example: 'alice@example.com' }) @IsEmail() email!: string;
  @ApiProperty({ minLength: 8, maxLength: 128 }) @IsString() @Length(8, 128) password!: string;
}
class LogoutDto {
  @ApiProperty() ok!: boolean;
}
export type AuthRequest = Request & { auth: AuthDto };
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: settings.secureCookie,
  path: '/api',
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = req.cookies?.student_session;
    if (typeof token !== 'string' || token.length !== 64)
      throw new UnauthorizedException('Please sign in.');
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('Your session has expired.');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.header('x-csrf-token') !== session.csrfToken
    ) {
      throw new ForbiddenException('Invalid CSRF token.');
    }
    const { id, name, email, role } = session.user;
    req.auth = { user: { id, name, email, role }, csrfToken: session.csrfToken };
    return true;
  }
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthDto })
  @ApiUnauthorizedResponse()
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthDto> {
    if (!req.is('application/json'))
      throw new UnsupportedMediaTypeException('Sign-in requires application/json.');
    // Do not trust client-supplied forwarding headers; single API instance in this scaffold.
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    for (const [ip, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(ip);
    const attempt = this.attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    if (attempt.count >= 20)
      throw new ForbiddenException('Too many sign-in attempts. Please try again later.');
    this.attempts.set(key, { ...attempt, count: attempt.count + 1 });
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
    });
    const valid = await verifyPassword(body.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw new UnauthorizedException('Email or password is incorrect.');
    this.attempts.delete(key);
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const maxAge = 8 * 60 * 60_000;
    const oldToken: unknown = req.cookies?.student_session;
    await this.prisma.$transaction(async (tx) => {
      if (typeof oldToken === 'string')
        await tx.authSession.deleteMany({ where: { tokenHash: hashToken(oldToken) } });
      await tx.authSession.create({
        data: {
          tokenHash: hashToken(token),
          csrfToken,
          userId: user.id,
          expiresAt: new Date(now + maxAge),
        },
      });
    });
    res.cookie('student_session', token, { ...cookieOptions, maxAge });
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrfToken,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthDto })
  me(@Req() req: AuthRequest): AuthDto {
    return req.auth;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: LogoutDto })
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.prisma.authSession.deleteMany({
      where: { tokenHash: hashToken(req.cookies.student_session as string) },
    });
    res.clearCookie('student_session', cookieOptions);
    return { ok: true };
  }
}
