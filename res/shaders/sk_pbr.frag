/*
 * Copyright (C) 2024 Ilya Perapechka
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * PBR BRDF functions based on Community Shaders (GPL-3.0 license)
 * https://github.com/doodlum/skyrim-community-shaders
 *   BRDF.hlsli / PBRMath.hlsli / PBR.hlsli
 * and orginal work by jonahex
 * https://github.com/Jonahex/nifskope/tree/SkyrimPBR
 * References:
 *   Walter et al. 2007 (GGX)
 *   Heitz 2014 (SmithJointApprox)
 *   Schlick 1994 (Fresnel)
 *   Lazarov 2013 (EnvBRDF)
 *   Estevez & Kulla 2017 (Charlie/fabric)
 *   Neubelt 2013 (velvet visibility)
 *   Lagarde 2014 (specular AO)
 */

#version 410 core

#include "uniforms.glsl"

#ifndef M_PI
	#define M_PI 3.1415926535897932384626433832795
#endif
#define M_TAU (2.0 * M_PI)
#define EPSILON 1e-5

uniform sampler2D BaseMap;
uniform sampler2D NormalMap;
uniform sampler2D GlowMap;
uniform sampler2D HeightMap;
uniform sampler2D LightMask;
uniform sampler2D BacklightMap;
uniform sampler2D EnvironmentMap;
uniform samplerCube CubeMap;

uniform vec3 subsurfaceColor;
uniform float thickness;

uniform vec3 coatColor;
uniform float coatStrength;
uniform float coatRoughness;
uniform float coatSpecularLevel;

uniform vec3 fuzzColor;
uniform float fuzzWeight;

uniform int pbrFlags;
// pbrFlags bits:
// 0 = PBR enabled
// 1 = TwoLayer/Coat
// 2 = Fuzz
// 3 = Subsurface
// 4 = ColoredCoat

uniform bool hasGlowMap;
uniform vec3 glowColor;
uniform float glowMult;

uniform float alpha;
uniform int alphaFlags;
uniform float alphaThreshold;

uniform vec3 tintColor;

uniform bool hasHeightMap;
uniform vec2 uvScale;
uniform vec2 uvOffset;

uniform bool hasEmit;
uniform bool hasSoftlight;
uniform bool hasBacklight;
uniform bool hasRimlight;
uniform bool hasTintColor;
uniform bool hasCubeMap;
uniform bool hasEnvMask;

uniform float lightingEffect1;
uniform float lightingEffect2;

uniform float envReflection;

uniform float specularLevel;
uniform float roughnessScale;
uniform float displacementScale;

in vec3 LightDir;
in vec3 ViewDir;

in vec2 texCoord;

flat in vec4 A;
in vec4 C;
flat in vec4 D;

in mat3 btnMatrix;

out vec4 fragColor;

mat3 btnMatrix_norm = mat3(normalize(btnMatrix[0]), normalize(btnMatrix[1]), normalize(btnMatrix[2]));


// ---- BRDF Building Blocks ----
// Based on Community Shaders BRDF.hlsli

// GGX/Trowbridge-Reitz NDF (Walter et al. 2007)
float D_GGX(float roughness, float NdotH)
{
	float a = roughness * roughness;
	float a2 = a * a;
	float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
	return a2 / (M_PI * d * d);
}

// Charlie NDF for fabric/fuzz (Estevez & Kulla 2017)
float D_Charlie(float roughness, float NdotH)
{
	float invAlpha = pow(abs(roughness), -4.0);
	float cos2h = NdotH * NdotH;
	float sin2h = 1.0 - cos2h;
	return (2.0 + invAlpha) * pow(abs(sin2h), invAlpha * 0.5) / M_TAU;
}

// Smith Joint Approximation (Heitz 2014, UE4 variant)
float Vis_SmithJointApprox(float roughness, float NdotV, float NdotL)
{
	float a = roughness * roughness;
	float Vis_SmithV = NdotL * (NdotV * (1.0 + a) + a);
	float Vis_SmithL = NdotV * (NdotL * (1.0 + a) + a);
	return 0.5 / max(Vis_SmithV + Vis_SmithL, EPSILON);
}

// Neubelt visibility for fabric (Neubelt 2013)
float Vis_Neubelt(float NdotV, float NdotL)
{
	return 1.0 / (4.0 * (NdotL + NdotV - NdotL * NdotV));
}

// Schlick Fresnel
vec3 F_Schlick(vec3 specularColor, float VdotH)
{
	float Fc = pow(1.0 - VdotH, 5.0);
	return clamp(50.0 * specularColor.g, 0.0, 1.0) * Fc + (1.0 - Fc) * specularColor;
}

// Lazarov EnvBRDF approximation (Lazarov 2013)
vec2 EnvBRDFApproxLazarov(float roughness, float NdotV)
{
	const vec4 c0 = vec4(-1, -0.0275, -0.572, 0.022);
	const vec4 c1 = vec4(1, 0.0425, 1.04, -0.04);
	vec4 r = roughness * c0 + c1;
	float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
	vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
	return AB;
}


// ---- Composite specular functions ----

// Standard GGX microfacet specular
vec3 GetSpecularMicrofacet(float roughness, vec3 specColor, float NdotL, float NdotV, float NdotH, float VdotH, out vec3 F)
{
	float D = D_GGX(roughness, NdotH);
	float G = Vis_SmithJointApprox(roughness, NdotV, NdotL);
	F = F_Schlick(specColor, VdotH);
	return D * G * F;
}

// Fabric/fuzz microflake specular (Charlie + Neubelt)
vec3 GetSpecularMicroflakes(float roughness, vec3 specColor, float NdotL, float NdotV, float NdotH, float VdotH)
{
	float D = D_Charlie(roughness, NdotH);
	float G = Vis_Neubelt(NdotV, NdotL);
	vec3 F = F_Schlick(specColor, VdotH);
	return D * G * F;
}

// Specular AO (Lagarde 2014, Frostbite)
float SpecularAOLagarde(float NdotV, float ao, float roughness)
{
	return clamp(pow(NdotV + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao, 0.0, 1.0);
}


// ---- Tone mapping ----
// Matches sk_default.frag: works in sRGB space, handles gamma internally

vec3 tonemap(vec3 x)
{
	float a = 0.15;
	float b = 0.50;
	float c = 0.10;
	float d = 0.20;
	float e = 0.02;
	float f = 0.30;

	vec3 z = x * x * D.a * (A.a * 4.22978723);
	z = (z * (a * z + b * c) + d * e) / (z * (a * z + b) + d * f) - e / f;
	return sqrt(z / (A.a * 0.93333333));
}


// ---- Parallax ----

float GetMipLevel(vec2 coords)
{
	ivec2 textureDims = textureSize(HeightMap, 0);
	vec2 texCoordsPerSize = coords * textureDims;
	vec2 dxSize = dFdx(texCoordsPerSize);
	vec2 dySize = dFdy(texCoordsPerSize);
	vec2 dTexCoords = dxSize * dxSize + dySize * dySize;
	float minTexCoordDelta = max(dTexCoords.x, dTexCoords.y);
	return max(0.5 * log2(minTexCoordDelta), 0);
}

vec2 GetParallaxCoords(float distance, vec2 coords, float mipLevel, vec3 viewDir)
{
	vec3 viewDirTS = normalize(viewDir * btnMatrix_norm);
	viewDirTS.xy /= viewDirTS.z * 0.7 + 0.3;

	float nearBlendToFar = clamp(distance / 2048.0, 0.0, 1.0);
	float maxHeight = 0.1 * displacementScale;
	float minHeight = maxHeight * 0.5;

	if (nearBlendToFar < 1.0) {
		uint numSteps = uint((32 * (1.0 - nearBlendToFar)) + 0.5);
		numSteps = clamp((numSteps + 3u) & ~0x03u, 4u, 32u);

		float stepSize = 1.0 / numSteps;

		vec2 offsetPerStep = viewDirTS.xy * vec2(maxHeight) * stepSize;
		vec2 prevOffset = viewDirTS.xy * vec2(minHeight) + coords.xy;

		float prevBound = 1.0;
		float prevHeight = 1.0;

		vec2 pt1 = vec2(0.0);
		vec2 pt2 = vec2(0.0);

		while (numSteps > 0u)
		{
			vec4 currentOffset[2];
			currentOffset[0] = prevOffset.xyxy - vec4(1, 1, 2, 2) * offsetPerStep.xyxy;
			currentOffset[1] = prevOffset.xyxy - vec4(3, 3, 4, 4) * offsetPerStep.xyxy;
			vec4 currentBound = prevBound - vec4(1, 2, 3, 4) * stepSize;

			vec4 currHeight;
			currHeight.x = textureLod(HeightMap, currentOffset[0].xy, mipLevel).r;
			currHeight.y = textureLod(HeightMap, currentOffset[0].zw, mipLevel).r;
			currHeight.z = textureLod(HeightMap, currentOffset[1].xy, mipLevel).r;
			currHeight.w = textureLod(HeightMap, currentOffset[1].zw, mipLevel).r;

			bvec4 testResult = bvec4(currHeight.x >= currentBound.x, currHeight.y >= currentBound.y, currHeight.z >= currentBound.z, currHeight.w >= currentBound.w);
			if (any(testResult))
			{
				if (testResult.w)
				{
					pt1 = vec2(currentBound.w, currHeight.w);
					pt2 = vec2(currentBound.z, currHeight.z);
				}
				if (testResult.z)
				{
					pt1 = vec2(currentBound.z, currHeight.z);
					pt2 = vec2(currentBound.y, currHeight.y);
				}
				if (testResult.y)
				{
					pt1 = vec2(currentBound.y, currHeight.y);
					pt2 = vec2(currentBound.x, currHeight.x);
				}
				if (testResult.x)
				{
					pt1 = vec2(currentBound.x, currHeight.x);
					pt2 = vec2(prevBound, prevHeight);
				}
				break;
			}

			prevOffset = currentOffset[1].zw;
			prevBound = currentBound.w;
			prevHeight = currHeight.w;
			numSteps -= 4u;
		}

		float delta2 = pt2.x - pt2.y;
		float delta1 = pt1.x - pt1.y;
		float denominator = delta2 - delta1;

		float parallaxAmount = 0.0;
		if (denominator != 0.0)
			parallaxAmount = (pt1.x * delta2 - pt2.x * delta1) / denominator;

		nearBlendToFar *= nearBlendToFar;

		float offset = (1.0 - parallaxAmount) * -maxHeight + minHeight;
		return mix(viewDirTS.xy * offset + coords.xy, coords, nearBlendToFar);
	}

	return coords;
}


// ---- Main ----

void main()
{
	vec2 offset = texCoord.st * uvScale + uvOffset;

	vec3 V = normalize(ViewDir);

	if ( hasHeightMap ) {
		float mipLevel = GetMipLevel(offset);
		offset = GetParallaxCoords(gl_FragCoord.z, offset, mipLevel, ViewDir);
	}

	vec4 baseMap = texture( BaseMap, offset );

	// Alpha test
	vec4 color = vec4( baseMap.rgb, 1.0 );
	if ( alphaFlags > 0 ) {
		float a = C.a * baseMap.a * alpha;
		int m = ( a < alphaThreshold ? 0x2B2B : ( a > alphaThreshold ? 0x7171 : 0x4D4D ) );
		if ( ( m & ( 1 << alphaFlags ) ) == 0 )
			discard;
		if ( ( alphaFlags & 8 ) != 0 )
			color.a = a;
	}

	vec4 normalMap = texture( NormalMap, offset );
	vec4 glowMap = texture( GlowMap, offset );
	vec4 rmaosMap = texture( EnvironmentMap, offset );

	// Material properties from RMAOS texture
	float roughness = clamp(rmaosMap.r * roughnessScale, 0.04, 1.0);
	float metallic = clamp(rmaosMap.g, 0.0, 1.0);
	float ao = rmaosMap.b;
	float reflectance = rmaosMap.a * specularLevel;

	// Albedo includes vertex color tint before metallic split
	vec3 albedo = baseMap.rgb * C.rgb;
	// F0: for dielectrics use RMAOS alpha (specular level), for metals use albedo
	vec3 f0 = mix(vec3(reflectance), albedo, metallic);
	// De-metallize: metals have no diffuse, only specular from albedo
	vec3 baseColor = albedo * (1.0 - metallic);

	vec3 normal = normalize(btnMatrix_norm * (normalMap.rgb * 2.0 - 1.0));
	if ( !gl_FrontFacing )
		normal *= -1.0;

	vec3 L = normalize(LightDir);
	vec3 H = normalize( L + V );

	float NdotL = dot(normal, L);
	float NdotH = max( dot(normal, H), EPSILON );
	float NdotV = abs( dot(normal, V) ) + EPSILON;
	float VdotH = max( dot(H, V), EPSILON );
	float VdotL = dot(V, L);
	float satNdotL = clamp( NdotL, EPSILON, 1.0 );

	// NifSkope provides lighting in sRGB space; keep consistent with other shaders
	vec3 ambientLight = A.rgb;
	vec3 directLight = D.rgb;

	// ---- Direct Lighting ----

	// Diffuse
	vec3 diffuse = baseColor * directLight * satNdotL;

	// Specular (GGX)
	vec3 fresnel;
	vec3 specular = GetSpecularMicrofacet(roughness, f0, satNdotL, NdotV, NdotH, VdotH, fresnel) * directLight * satNdotL;

	// Multi-scatter energy compensation (Kulla & Conty approximation via EnvBRDF)
	vec2 specularBRDF = EnvBRDFApproxLazarov(roughness, NdotV);
	float energyCompensation_denom = specularBRDF.x + specularBRDF.y;
	vec3 energyCompensation = vec3(1.0);
	if ( energyCompensation_denom > EPSILON )
		energyCompensation = 1.0 + f0 * (1.0 / energyCompensation_denom - 1.0);
	specular *= energyCompensation;

	// ---- Indirect Lighting ----

	// Diffuse ambient
	vec3 indirectDiffuse = baseColor * ambientLight * ao;

	// Specular ambient (env BRDF approximation)
	vec3 specularLobeWeight = f0 * specularBRDF.x + specularBRDF.y;
	specularLobeWeight *= energyCompensation;
	float specAO = SpecularAOLagarde(NdotV, ao, roughness);
	vec3 indirectSpecular = specularLobeWeight * ambientLight * specAO;

	// Conserve energy: reduce diffuse by specular contribution
	indirectDiffuse *= (1.0 - specularLobeWeight);

	// ---- Cube map IBL ----
	if ( hasCubeMap ) {
		vec3 R = reflect( -V, normal );
		vec3 reflectedWS = envMapRotation * R;
		vec4 cube = texture( CubeMap, reflectedWS );
		indirectSpecular += cube.rgb * envReflection * specularLobeWeight * specAO;
	} else {
		// Fallback: use ambient as crude environment reflection for metals
		// Without this, metallic surfaces appear black since they have no diffuse
		indirectSpecular += ambientLight * specularLobeWeight * specAO;
	}

	// ---- Subsurface Scattering (flag bit 3) ----
	vec3 transmission = vec3(0.0);
	if ( (pbrFlags & 8) != 0 )
	{
		vec4 subsurfaceMap = texture( BacklightMap, offset );
		vec3 sssColor = subsurfaceColor * subsurfaceMap.rgb;
		float sssThickness = thickness * subsurfaceMap.a;

		const float subsurfacePower = 12.234;
		float forwardScatter = exp2(clamp(-VdotL, 0.0, 1.0) * subsurfacePower - subsurfacePower);
		float backScatter = clamp(satNdotL * sssThickness + (1.0 - sssThickness), 0.0, 1.0) * 0.5;
		float subsurface = mix(backScatter, 1.0, forwardScatter) * (1.0 - sssThickness);
		transmission = sssColor * subsurface * directLight;

		// Subsurface ambient contribution
		indirectDiffuse += subsurfaceColor * (1.0 - thickness) * ambientLight * ao;
	}

	// ---- Fuzz/Fabric (flag bit 2, mutually exclusive with TwoLayer) ----
	if ( (pbrFlags & 4) != 0 )
	{
		// Fuzz specular uses Charlie NDF + Neubelt visibility
		vec3 fuzzSpecular = GetSpecularMicroflakes(roughness, fuzzColor, satNdotL, NdotV, NdotH, VdotH);
		fuzzSpecular *= directLight * satNdotL;

		// Multi-scatter compensation for fuzz
		vec2 fuzzBRDF = EnvBRDFApproxLazarov(roughness, NdotV);
		float fuzzEnergyDenom = fuzzBRDF.x + fuzzBRDF.y;
		if ( fuzzEnergyDenom > EPSILON )
			fuzzSpecular *= 1.0 + fuzzColor * (1.0 / fuzzEnergyDenom - 1.0);

		// Blend between standard specular and fuzz specular
		specular = mix(specular, fuzzSpecular, fuzzWeight);

		// Fuzz ambient contribution
		indirectDiffuse += fuzzColor * fuzzWeight * ambientLight * ao;
	}

	// ---- TwoLayer/Coat (flag bit 1, mutually exclusive with Fuzz) ----
	vec3 coatDiffuseContribution = vec3(0.0);
	if ( (pbrFlags & 2) != 0 )
	{
		// Coat specular (same GGX model, separate roughness)
		float coatR = clamp(coatRoughness, 0.04, 1.0);
		vec3 coatF0 = vec3(coatSpecularLevel);
		vec3 coatF;
		vec3 coatSpec = GetSpecularMicrofacet(coatR, coatF0, satNdotL, NdotV, NdotH, VdotH, coatF);
		coatSpec *= directLight * satNdotL;

		// Layer attenuation: coat absorbs light before reaching base
		float layerAttenuation = 1.0 - coatF.r * coatStrength;

		// Attenuate base diffuse and specular
		diffuse *= layerAttenuation;
		specular *= layerAttenuation;

		// Add coat specular
		specular += coatSpec * coatStrength;

		// Coat also attenuates indirect
		float coatFresnel_indirect = F_Schlick(coatF0, NdotV).r;
		float indirectLayerAttenuation = 1.0 - coatFresnel_indirect * coatStrength;
		indirectDiffuse *= indirectLayerAttenuation;
		indirectSpecular *= indirectLayerAttenuation;

		// Coat specular ambient
		vec2 coatBRDF = EnvBRDFApproxLazarov(coatR, NdotV);
		indirectSpecular += (coatF0 * coatBRDF.x + coatBRDF.y) * coatStrength * ambientLight * specAO;

		// Colored coat diffuse (flag bit 4)
		if ( (pbrFlags & 16) != 0 ) {
			coatDiffuseContribution = coatColor * directLight * satNdotL;
			// Colored coat indirect
			vec3 coatSpecLobeWeight = coatF0 * coatBRDF.x + coatBRDF.y;
			indirectDiffuse += coatColor * (1.0 - coatSpecLobeWeight) * coatStrength * ambientLight * ao;
		}
	}

	// ---- Emissive ----
	vec3 emissive = vec3(0.0);
	if ( hasEmit ) {
		emissive = glowColor * glowMult * glowScaleSRGB;
		if ( hasGlowMap )
			emissive *= glowMap.rgb;
	}

	// ---- Composite ----
	color.rgb = diffuse + indirectDiffuse + specular + indirectSpecular + transmission + emissive;

	// Apply colored coat diffuse
	if ( (pbrFlags & 18) == 18 )  // bits 1 and 4 both set
		color.rgb = mix(color.rgb, color.rgb - diffuse + coatDiffuseContribution, coatStrength);

	// Tonemap (same as sk_default.frag, works in sRGB space)
	color.rgb = tonemap( color.rgb );
	color.a = C.a * baseMap.a;

	fragColor = color;
	fragColor.a *= alpha;
}
