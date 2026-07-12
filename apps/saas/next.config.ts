// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
	// Emit a self-contained server bundle for the Docker runtime image
	// (apps/saas/.next/standalone/...). Required by the Railway deployment.
	output: "standalone",
	transpilePackages: ["@repo/api", "@repo/auth", "@repo/database", "@repo/ui"],
	images: {
		remotePatterns: [
			{
				// google profile images
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				// github profile images
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
		],
	},
	async headers() {
		return [
			{
				// The embeddable widget iframe (page W2a will add at /widget/embed)
				// must be embeddable on ANY customer website, so we override the
				// app's default frame-ancestors restriction for this path only.
				// Real access control is the widget token + Origin check on
				// /api/widget/session — not the frame-ancestors header. Scoped to
				// /widget/* so no other route's framing policy is affected.
				source: "/widget/:path*",
				headers: [
					{
						key: "Content-Security-Policy",
						value: "frame-ancestors *",
					},
				],
			},
		];
	},
	async redirects() {
		return [
			{
				source: "/settings",
				destination: "/settings/general",
				permanent: true,
			},
			{
				source: "/:organizationSlug/settings",
				destination: "/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: "/admin",
				destination: "/admin/users",
				permanent: true,
			},
		];
	},
	webpack: (config, { webpack, isServer }) => {
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
			}),
		);

		if (isServer) {
			config.plugins.push(new PrismaPlugin());
		}

		return config;
	},
};

export default withNextIntl(nextConfig);
