# Deployment Guide

This guide explains how to deploy this React SPA application to different hosting platforms.

## The 404 Issue

When deploying a React Single Page Application (SPA) with client-side routing (like React Router), you may encounter 404 errors when directly accessing routes like `/mobileroute`. This happens because the server tries to find a physical file at that path instead of serving `index.html`.

## Solution

The project includes configuration files for different hosting platforms. Use the appropriate one for your deployment:

### 1. **Netlify** (Recommended)
- Uses: `public/_redirects`
- The file is already in the correct location
- Just deploy your `dist` folder or connect your Git repository
- Netlify will automatically use the `_redirects` file

### 2. **Vercel**
- Uses: `vercel.json` (in root directory)
- Deploy using Vercel CLI or connect your Git repository
- Vercel will automatically detect and use `vercel.json`

### 3. **Apache Server**
- Uses: `public/.htaccess`
- The file will be copied to `dist` during build
- Make sure your Apache server has `mod_rewrite` enabled
- Upload the `dist` folder to your server

### 4. **Nginx**
- Uses: `nginx.conf` (in root directory)
- Copy the configuration to your Nginx server
- Update the `root` path to match your deployment location
- Restart Nginx: `sudo systemctl restart nginx`

### 5. **GitHub Pages**
If deploying to GitHub Pages, you may need to:
1. Set `base: '/your-repo-name/'` in `vite.config.ts`
2. Or use a custom domain

### 6. **Other Static Hosting**
For other static hosting services:
- Check their documentation for SPA routing support
- Most modern platforms (Cloudflare Pages, AWS S3 + CloudFront, etc.) support redirect rules
- Use the Apache `.htaccess` approach as a reference

## Build and Deploy

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Deploy the `dist` folder** to your hosting platform

3. **Verify the routes work:**
   - Try accessing `/mobileroute` directly
   - It should load the app instead of showing 404

## Testing Locally

After building, test locally with:
```bash
npm run preview
```

This will serve the built files and you can test if routing works correctly.

## Troubleshooting

- **Still getting 404?** 
  - Make sure the configuration file for your platform is in the correct location
  - For Netlify: `_redirects` must be in `public/` folder
  - For Vercel: `vercel.json` must be in root directory
  - For Apache: `.htaccess` must be in `public/` folder (will be copied to `dist/`)

- **Routes work in development but not in production?**
  - This is normal - development server handles this automatically
  - You need the configuration files for production

- **Base path issues?**
  - If your app is deployed to a subdirectory (e.g., `/my-app/`), update the `base` in `vite.config.ts`

