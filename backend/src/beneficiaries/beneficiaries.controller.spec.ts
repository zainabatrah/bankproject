import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';

describe('BeneficiariesController', () => {
  const request = {
    user: { sub: 7, email: 'user@example.com', role: 'CUSTOMER' },
  };
  let beneficiariesService: {
    create: jest.Mock;
    findMine: jest.Mock;
    remove: jest.Mock;
  };
  let controller: BeneficiariesController;

  beforeEach(() => {
    beneficiariesService = {
      create: jest.fn(),
      findMine: jest.fn(),
      remove: jest.fn(),
    };
    controller = new BeneficiariesController(
      beneficiariesService as unknown as BeneficiariesService,
    );
  });

  it('creates, lists, and removes beneficiaries for the authenticated subject', () => {
    const dto = { name: 'Receiver', accountNumber: 'BS200' };

    controller.create(request as never, dto);
    controller.findMine(request as never);
    controller.remove(request as never, 30);

    expect(beneficiariesService.create).toHaveBeenCalledWith(7, dto);
    expect(beneficiariesService.findMine).toHaveBeenCalledWith(7);
    expect(beneficiariesService.remove).toHaveBeenCalledWith(7, 30);
  });
});
