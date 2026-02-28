import { ReadReferralContractService } from '../readReferralContract.service.js';
import { createWebSocketClient } from '../clients.js';
import { PublicClient, ReadContractParameters } from 'viem';

// Mock the createWebSocketClient so it returns a mocked publicClient
jest.mock('../clients.js', () => ({
  createWebSocketClient: jest.fn(),
}));

describe('ReadReferralContractService', () => {
  let mockPublicClient: Partial<PublicClient>;
  let service: ReadReferralContractService;

  beforeEach(() => {
    // Create a mocked PublicClient
    mockPublicClient = {
      readContract: jest.fn(
        async (args: ReadContractParameters<any, string, readonly any[]>) => {
          if (args.functionName === 'viewPoints') return 42;
          if (args.functionName === 'viewReferrals') return ['0xabc', '0xdef'];
          if (args.functionName === 'viewReferrer') return '0xxyz';
          throw new Error(`Unexpected function: ${args.functionName}`);
        }
      ) as unknown as PublicClient['readContract'],
    } as unknown as PublicClient;

    // Make createWebSocketClient return this mocked client
    (createWebSocketClient as jest.Mock).mockReturnValue({
      publicClient: mockPublicClient,
    });

    // Now instantiate your service; it will use the mocked publicClient
    service = new ReadReferralContractService({
      publicClient: mockPublicClient as PublicClient,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns mocked points from getUserCurrentPoints', async () => {
    const points = await service.getUserCurrentPoints('0x123');
    expect(points).toBe(42);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'viewPoints', args: ['0x123'] })
    );
  });

  test('returns mocked referrals from getReferrals', async () => {
    const referrals = await service.getReferrals('0x123');
    expect(referrals).toEqual(['0xabc', '0xdef']);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'viewReferrals', args: ['0x123'] })
    );
  });

  test('returns mocked referrer from getReferrers', async () => {
    const referrer = await service.getReferrers('0x123');
    expect(referrer).toBe('0xxyz');
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'viewReferrer', args: ['0x123'] })
    );
  });
});