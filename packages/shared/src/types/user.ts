export enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}

export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePhotoUrl?: string;
  // Note: passwords are managed by Better Auth, never exposed here.
  role: UserRole;
  isSystemAdmin?: boolean;
  creditsRemaining?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateDto {
  email: string;
  username: string;
  password: string;
}

export interface UserLoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'passwordHash'>;
}

export interface UserInvitation {
  id: string;
  email: string;
  invitedBy: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  accepted: boolean;
  createdAt: Date;
}

export interface UserInvitationResponse {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  inviteUrl: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  isExpired?: boolean;
  emailSent?: boolean;
  emailStatus?: string;
}

export interface AdminResetPasswordResponse {
  message: string;
  temporaryPassword: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

export interface UserInvitationCreateDto {
  email: string;
  role: UserRole;
}

export interface UserRegisterWithInviteDto {
  token: string;
  username: string;
  password: string;
}

export interface UserDirectCreateDto {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface UserDirectCreateResponse {
  user: Omit<User, 'passwordHash'>;
  generatedPassword: string;
}

export interface UsernameSuggestionsResponse {
  suggestions: string[];
}

export interface UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateEmailDto {
  email: string;
  password: string; // Require password for security
}

export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
}
