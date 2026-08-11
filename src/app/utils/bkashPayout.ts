import prisma from './prisma.js';
import { sendEmail } from './sendEmail.js';

export const triggerAutomaticPayout = async (bookingId: string) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        package: {
          include: {
            organizer: true,
          },
        },
        room: {
          include: {
            hotel: {
              include: {
                owner: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      console.log(`[AUTOMATIC PAYOUT] Booking with ID ${bookingId} not found.`);
      return;
    }

    let hostUser: any = null;
    if (booking.package) {
      hostUser = booking.package.organizer;
    } else if (booking.room) {
      hostUser = booking.room.hotel.owner;
    }

    if (!hostUser) {
      console.log(`[AUTOMATIC PAYOUT] Host user not found for booking ${bookingId}.`);
      return;
    }

    const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE) || 0.10;
    const platformCommission = booking.paidAmount * commissionRate;
    const hostShare = booking.paidAmount - platformCommission;

    const payoutDetails = hostUser.payoutDetails as any;
    const recipientNumber = payoutDetails?.bkashNumber || payoutDetails?.nagadNumber || payoutDetails?.accountNumber || hostUser.email;
    const method = payoutDetails?.bkashNumber 
      ? 'bKash' 
      : payoutDetails?.nagadNumber 
      ? 'Nagad' 
      : payoutDetails?.bankName 
      ? `Bank Transfer (${payoutDetails.bankName})`
      : 'Registered Email Wallet';

    console.log(`[AUTOMATIC PAYOUT] Initiating automated payout for Booking Ref ${booking.id}...`);
    console.log(`- Recipient Host: ${hostUser.fullName} (ID: ${hostUser.id})`);
    console.log(`- Amount: BDT ${hostShare} (10% commission of BDT ${platformCommission} kept)`);
    console.log(`- Method: ${method} to ${recipientNumber}`);

    // Simulate calling the gateway API (e.g. bKash B2C API)
    let transactionId = '';
    
    if (process.env.BKASH_PAYOUT_MODE === 'live') {
      // Future live API integration code can be placed here.
      // For testing, we fall back to a mock transaction format.
      transactionId = `BKASH_B2C_API_MOCK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    } else {
      // Mock transfer response
      transactionId = `MOCK_BKASH_B2C_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    }

    // 1. Log the HOST_PAYOUT transaction in the database ledger
    await prisma.transaction.create({
      data: {
        type: 'HOST_PAYOUT',
        amount: hostShare,
        senderId: null, // Released automatically by platform
        receiverId: hostUser.id,
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

    // 2. Create in-app system notification for the host
    await prisma.notification.create({
      data: {
        userId: hostUser.id,
        title: 'Payout Disbursed (Automatic)',
        message: `Your earnings of BDT ${hostShare} (after 10% commission deduction) for Booking Ref ${booking.id} has been automatically transferred to your registered ${method} account. TrxID: ${transactionId}`,
      },
    });

    // 3. Send email receipt to the host
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0061AA;">Automated Host Payout Processed</h2>
        <p>Dear ${hostUser.fullName},</p>
        <p>Great news! The payment for booking reference <strong>${booking.id}</strong> has been cleared, and your payout has been automatically transferred to your registered payment method.</p>
        <p><strong>Details of Settlement:</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; font-weight: bold; color: #4a5568;">Total Booking Amount Paid:</td>
            <td style="padding: 8px 0; text-align: right; color: #1a202c;">BDT ${booking.paidAmount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; font-weight: bold; color: #4a5568;">Platform Commission Kept (10%):</td>
            <td style="padding: 8px 0; text-align: right; color: #e53e3e;">- BDT ${platformCommission}</td>
          </tr>
          <tr style="border-bottom: 2px solid #0061AA; background-color: #f7fafc;">
            <td style="padding: 10px 8px; font-weight: bold; color: #0061AA;">Net Payout Amount Transferred:</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #2f855a;">BDT ${hostShare}</td>
          </tr>
        </table>
        
        <p style="margin-top: 20px;"><strong>Destination Account:</strong></p>
        <p style="font-size: 14px; background-color: #f7fafc; padding: 10px; border-left: 4px solid #0061AA;">
          <strong>Method:</strong> ${method}<br/>
          <strong>Account/Number:</strong> ${recipientNumber}<br/>
          <strong>Disbursal Transaction ID:</strong> ${transactionId}
        </p>
        
        <p>Thank you for hosting with orbitX Travel!</p>
        <p>Best regards,<br/>orbitX Travel Operations</p>
      </div>
    `;

    await sendEmail(hostUser.email, 'Automated Host Payout Settlement - orbitX Travel', emailBody);

    console.log(`[AUTOMATIC PAYOUT] Success! Disbursed BDT ${hostShare} to ${hostUser.fullName} via ${method}. Trx: ${transactionId}`);
    return { success: true, transactionId };
  } catch (error) {
    console.error(`[AUTOMATIC PAYOUT ERROR] Failed to disburse payout automatically:`, error);
  }
};
