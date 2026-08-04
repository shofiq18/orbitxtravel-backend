import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const generateVoucherPDF = async (
  booking: any,
  packageTitle: string,
  travelerName: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const dirPath = path.join(process.cwd(), 'public', 'vouchers');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      const filename = `voucher_${booking.id}.pdf`;
      const filePath = path.join(dirPath, filename);
      const writeStream = fs.createWriteStream(filePath);
      
      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(writeStream);

      // Header block
      doc
        .fillColor('#1e3a8a')
        .fontSize(28)
        .text('orbitX Travel', { align: 'center' });
      
      doc
        .fillColor('#4b5563')
        .fontSize(10)
        .text('Official Seat Lock Booking Voucher', { align: 'center' });
      
      doc.moveDown(2);
      
      // Horizontal Line divider
      doc
        .moveTo(50, 110)
        .lineTo(550, 110)
        .stroke('#e5e7eb');
      
      doc.moveDown(2);

      // Voucher details
      doc
        .fillColor('#111827')
        .fontSize(14)
        .text(`Booking Reference: ${booking.id}`, { underline: true });
      
      doc.moveDown();

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Tour Package:    ${packageTitle}`);
      doc.text(`Traveler Name:   ${travelerName}`);
      doc.text(`Seats Booked:    ${booking.seatsBooked}`);
      doc.text(`Total Price:     BDT ${booking.totalAmount}`);
      doc.text(`Paid Deposit:    BDT ${booking.paidAmount} (SEAT LOCKED)`);
      doc.text(`Pending Due:     BDT ${booking.totalAmount - booking.paidAmount}`);
      
      doc.moveDown();
      
      doc.text(`Status:          CONFIRMED`, { stroke: true });
      doc.text(`Date of Booking: ${new Date(booking.createdAt).toLocaleDateString()}`);

      doc.moveDown(3);

      // QR Code Simulation Border
      doc
        .rect(200, 320, 200, 200)
        .stroke('#3b82f6')
        .fontSize(10)
        .fillColor('#6b7280')
        .text('[ orbitX Verified QR Code Security Stamp ]', 220, 410);

      // Footer
      doc
        .fillColor('#ef4444')
        .fontSize(9)
        .text(
          '* Please bring a digital or printed copy of this voucher to the departure hub. Booking fees are subject to tour organizer terms and cancellation policy.',
          50,
          540,
          { align: 'center', width: 500 }
        );

      doc.end();

      writeStream.on('finish', () => {
        resolve(`/vouchers/${filename}`);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
};
