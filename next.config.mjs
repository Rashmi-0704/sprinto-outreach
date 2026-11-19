/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['nodemailer', 'cheerio'] },
};
export default nextConfig;
