export type UserRole =
  | 'CUSTOMER'
  | 'BANK_EMPLOYEE'
  | 'FRAUD_ANALYST'
  | 'SECURITY_ANALYST'
  | 'ADMIN'

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED'
export type TransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FLAGGED'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type AlertStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'FALSE_POSITIVE'

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: UserStatus
  mfaEnabled?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  user: User
  isDemo?: boolean
}

export interface Account {
  id: number
  accountNumber: string
  balance: number | string
  currency: 'USD' | 'EUR' | 'LBP' | string
  createdAt: string
}

export interface Beneficiary {
  id: number
  name: string
  accountNumber: string
  bankName?: string | null
  ownerId?: number
  createdAt: string
  updatedAt?: string
}

export interface Transaction {
  id: number
  reference: string
  amount: number | string
  currency: string
  description?: string | null
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL'
  status: TransactionStatus
  senderAccountId?: number | null
  receiverAccountId?: number | null
  riskScore?: number | null
  riskLevel?: RiskLevel | null
  createdAt: string
  updatedAt?: string
}

export interface Device {
  id: number
  deviceId: string
  browser?: string | null
  os?: string | null
  trusted: boolean
  firstSeen: string
  lastSeen: string
}

export interface RelatedUser {
  id: number
  email: string
  firstName: string
  lastName: string
  status?: UserStatus
}

export interface AlertAccount {
  id: number
  accountNumber: string
  currency: string
  balance?: number | string
  user: RelatedUser
}

export interface AlertTransaction extends Transaction {
  senderAccount?: AlertAccount | null
  receiverAccount?: AlertAccount | null
}

export interface FraudAlert {
  id: number
  riskScore: number
  riskLevel: RiskLevel
  reason: string
  status: AlertStatus
  transactionId: number
  transaction: AlertTransaction
  createdAt: string
  updatedAt: string
}

export interface AdminUser extends User {
  _count?: {
    accounts: number
    devices: number
    loginAttempts: number
    securityEvents: number
  }
}

export interface AuditLog {
  id: number
  action: string
  resource?: string | null
  result?: string | null
  details?: string | null
  userId?: number | null
  user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'> | null
  createdAt: string
}

export interface TransferPayload {
  senderAccountId: number
  beneficiaryId: number
  amount: number
  description?: string
}

export interface LoginResult {
  mfaRequired?: boolean
  mfaToken?: string
  expiresIn?: number
  message?: string
}
