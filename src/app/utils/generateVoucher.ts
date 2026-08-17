import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import config from '../../config/index.js';
import { uploadToCloudinary } from './upload.js';

export const generateVoucherPDF = async (
  booking: any,
  packageTitle: string,
  travelerName: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);

          // If Cloudinary credentials are configured (e.g. on Vercel / Production), upload directly to Cloudinary
          if (config.cloudinary_name && config.cloudinary_api_key && config.cloudinary_api_secret) {
            const base64Pdf = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
            const cloudUrl = await uploadToCloudinary(base64Pdf);
            return resolve(cloudUrl);
          }

          // Fallback for local development if Cloudinary is not configured
          const dirPath = path.join(process.cwd(), 'public', 'vouchers');
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          const filename = `voucher_${booking.id}.pdf`;
          const filePath = path.join(dirPath, filename);
          fs.writeFileSync(filePath, pdfBuffer);
          resolve(`/vouchers/${filename}`);
        } catch (error) {
          reject(error);
        }
      });

      doc.on('error', (err) => reject(err));

      // --- BRAND HEADER BLOCK ---
      // Draw a sleek dark blue/slate top banner
      doc.rect(0, 0, 612, 100).fill('#1e3b8b'); // Deep Navy Blue Brand Accent

      // Brand Title
      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(22)
         .text('OrbitX Travel', 50, 30);
         
      doc.fillColor('#93c5fd')
         .font('Helvetica')
         .fontSize(9)
         .text('OFFICIAL TRAVEL VOUCHER & RECEIPT', 50, 58);

      // Top Right: Reference Meta
      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('VOUCHER REF', 362, 24, { align: 'right', width: 200 });

      // Truncate/style the reference ID if it's too long
      const refId = (booking.id || '').toString().toUpperCase();
      doc.fillColor('#60a5fa')
         .font('Helvetica-Bold')
         .fontSize(8.5)
         .text(refId, 362, 36, { align: 'right', width: 200 });

      doc.fillColor('#93c5fd')
         .font('Helvetica')
         .fontSize(8)
         .text(`ISSUED: ${new Date(booking.createdAt).toLocaleDateString()}`, 362, 68, { align: 'right', width: 200 });

      let y = 130;

      // --- STATUS BANNER ---
      // Draw a light green badge for status confirmation
      doc.rect(50, y, 512, 36).fill('#ecfdf5');
      doc.rect(50, y, 512, 36).stroke('#10b981');
      
      doc.fillColor('#065f46')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('STATUS: CONFIRMED (SEAT LOCKED)', 65, y + 13);
      
      y += 60;

      // --- SECTION: BOOKING DETAILS (TWO COLUMNS) ---
      doc.fillColor('#1e293b')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('TRAVELER DETAILS', 50, y);
      
      doc.moveTo(50, y + 14)
         .lineTo(280, y + 14)
         .stroke('#cbd5e1');

      let travelerY = y + 24;
      doc.fontSize(9).fillColor('#64748b').font('Helvetica');
      doc.text('Full Name:', 50, travelerY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(travelerName, 130, travelerY);

      travelerY += 18;
      doc.fillColor('#64748b').font('Helvetica').text('Email Address:', 50, travelerY);
      doc.fillColor('#0f172a').font('Helvetica').text(booking.traveler?.email || 'N/A', 130, travelerY);

      travelerY += 18;
      doc.fillColor('#64748b').font('Helvetica').text('Booked Seats:', 50, travelerY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(`${booking.seatsBooked} Seat(s)`, 130, travelerY);

      // Col 2: Tour Details
      doc.fillColor('#1e293b')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('TOUR DETAILS', 320, y);
      
      doc.moveTo(320, y + 14)
         .lineTo(562, y + 14)
         .stroke('#cbd5e1');

      let tourY = y + 24;
      doc.fontSize(9).fillColor('#64748b').font('Helvetica');
      doc.text('Tour Package:', 320, tourY);
      doc.fillColor('#0f172a').font('Helvetica-Bold').text(packageTitle, 400, tourY, { width: 162 });

      tourY += 28; // Package title might wrap, give it space
      doc.fillColor('#64748b').font('Helvetica').text('Booking Date:', 320, tourY);
      doc.fillColor('#0f172a').font('Helvetica').text(new Date(booking.createdAt).toLocaleDateString(), 400, tourY);

      y = Math.max(travelerY, tourY) + 40;

      // --- SECTION: PAYMENT DETAILS (TABLE STYLED) ---
      doc.fillColor('#1e293b')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text('PAYMENT SUMMARY', 50, y);
      
      doc.moveTo(50, y + 14)
         .lineTo(562, y + 14)
         .stroke('#cbd5e1');

      y += 24;

      // Table Header Row
      doc.rect(50, y, 512, 22).fill('#f1f5f9');
      doc.fillColor('#475569')
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('Billing Item Description', 65, y + 6)
         .text('Amount (BDT)', 450, y + 6, { align: 'right', width: 100 });

      y += 22;

      const paymentRows = [
        { label: 'Total Package Price Due', amount: booking.totalAmount, color: '#334155', isBold: false, isPaid: false },
        { label: 'Deposit Paid (Seat Lock Payment Received)', amount: booking.paidAmount, color: '#047857', isBold: true, isPaid: true },
        { label: 'Remaining Balance Due at Departure', amount: (booking.totalAmount - booking.paidAmount), color: '#b91c1c', isBold: true, isDue: true }
      ];

      for (const row of paymentRows) {
        // Light row border
        doc.moveTo(50, y + 26)
           .lineTo(562, y + 26)
           .stroke('#f1f5f9');

        doc.fillColor(row.color);
        if (row.isBold) {
          doc.font('Helvetica-Bold');
        } else {
          doc.font('Helvetica');
        }
        
        doc.fontSize(9.5)
           .text(row.label, 65, y + 8);
        
        const prefix = row.isPaid ? '-' : '';
        doc.text(`${prefix}BDT ${row.amount.toLocaleString()}`, 450, y + 8, { align: 'right', width: 100 });
        
        y += 26;
      }

      y += 30;

      // --- TERMS & IMPORTANT STAMP BOX ---
      doc.rect(50, y, 512, 85).fill('#f8fafc');
      doc.rect(50, y, 512, 85).stroke('#e2e8f0');

      doc.fillColor('#1e293b')
         .font('Helvetica-Bold')
         .fontSize(9.5)
         .text('IMPORTANT CONDITIONS & INFORMATION', 65, y + 12);

      doc.fillColor('#475569')
         .font('Helvetica')
         .fontSize(8)
         .text('1. Please carry a digital or printed copy of this voucher to present at the departure point.', 65, y + 28, { width: 480 })
         .text('2. The deposit amount paid is non-refundable and subject to organizers\' terms & cancellation policy.', 65, y + 42, { width: 480 })
         .text('3. Remaining dues must be cleared in full before departure as specified by the tour guide.', 65, y + 56, { width: 480 });

      // --- BRAND FOOTER ---
      doc.moveTo(50, 710)
         .lineTo(562, 710)
         .stroke('#e2e8f0');

      doc.fillColor('#94a3b8')
         .font('Helvetica')
         .fontSize(8)
         .text('OrbitX Travel • Connecting you to your next adventure', 50, 722, { align: 'center', width: 512 })
         .text('For support or queries, email support@orbitxtravel.com or call +880-9612-XXXXXX', 50, 734, { align: 'center', width: 512 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
