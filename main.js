import * as THREE from 'three';
import gsap from 'gsap';

// ==========================================
// 1. V1 GEOGRAPHIC CONSTANTS & MATH
// ==========================================
const minLng = -83.5, maxLng = -64.5;
const minLat = -5.0, maxLat = 14.0;
const scaleFactor = 12.0; 
const centerLng = -74.0, centerLat = 4.5;
const sphereRadius = 9.5; 

const colombiaPolygon = [[-71.6, 12.45], [-71.3, 12.15], [-71.3, 11.8], [-72.3, 11.4], [-72.5, 10.3], [-72.9, 9.2], [-72.2, 9.0], [-72.5, 8.2], [-72.1, 7.5], [-72.4, 7.1], [-71.5, 7.1], [-70.8, 6.2], [-67.8, 6.2], [-67.4, 5.0], [-67.8, 3.8], [-67.5, 1.8], [-66.8, 1.2], [-69.8, 1.1], [-69.9, -4.2], [-70.5, -4.2], [-71.5, -3.0], [-73.0, -2.1], [-74.5, -1.8], [-75.2, -0.1], [-76.2, -0.1], [-77.8, -1.0], [-79.0, 1.2], [-79.0, 1.6], [-78.2, 2.5], [-77.4, 3.2], [-77.3, 4.5], [-77.4, 5.5], [-77.4, 6.8], [-77.7, 7.3], [-77.9, 7.8], [-77.3, 8.3], [-76.8, 8.5], [-76.3, 8.0], [-75.5, 9.6], [-75.6, 10.4], [-74.8, 11.0], [-73.2, 11.2], [-73.0, 11.6], [-72.5, 12.1], [-71.6, 12.45]];
function isPointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}
function getTerritory(lng, lat) {
    if (isPointInPolygon([lng, lat], colombiaPolygon)) return "COLOMBIA";
    if (lng < -77.5 && lat < 7.0) return (lat < 1.5 && lng > -80.5) ? "NEIGHBOR" : "OCEAN";
    if (lat > 11.5) return (lng > -73.0 && lng < -71.0 && lat < 12.5) ? "COLOMBIA" : "OCEAN";
    if (lat > 9.0 && lat < 11.5 && lng < -76.8) return (lng < -77.3 && lat < 9.5) ? "NEIGHBOR" : "OCEAN";
    return "NEIGHBOR";
}
function getRealisticHeight(lng, lat) {
    return Math.random() * 0.5 + 0.1;
}
function lngLatToPixel(lng, lat) {
    const u = Math.floor(((lng - minLng) / (maxLng - minLng)) * 512);
    const v = Math.floor((1.0 - (lat - minLat) / (maxLat - minLat)) * 512);
    return { u: Math.max(0, Math.min(511, u)), v: Math.max(0, Math.min(511, v)) };
}

// ==========================================
// 2. ASSET LOADER
// ==========================================
let elevData = null, terrData = null;

function loadAssetsAndStart() {
    let loaded = 0, booted = false;
    const checkReady = () => { if (++loaded === 2 && !booted) { booted = true; initApp(elevData, terrData, false); } };
    const fail = () => { if (!booted) { booted = true; console.warn("Using procedural fallback."); initApp(null, null, true); } };
    setTimeout(fail, 1500);

    const imgElev = new Image();
    imgElev.onload = () => {
        const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 512;
        const ctx = cvs.getContext('2d'); ctx.drawImage(imgElev, 0, 0);
        elevData = ctx.getImageData(0, 0, 512, 512).data; checkReady();
    };
    imgElev.onerror = fail; imgElev.src = "elevation.png";

    const imgTerr = new Image();
    imgTerr.onload = () => {
        const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 512;
        const ctx = cvs.getContext('2d'); ctx.drawImage(imgTerr, 0, 0);
        terrData = ctx.getImageData(0, 0, 512, 512).data; checkReady();
    };
    imgTerr.onerror = fail; imgTerr.src = "territories.png";
}

// ==========================================
// 3. MAIN APPLICATION
// ==========================================
function initApp(elevPixelData, terrPixelData, isFallback) {
    const canvas = document.querySelector('#webgl-canvas');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4ebd8);
    scene.fog = new THREE.FogExp2(0xf4ebd8, 0.035); 

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = "YXZ"; 

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
    dirLight.position.set(6, 15, 8);
    scene.add(dirLight);

    // --- Build Point Cloud ---
    let instancedMesh;
    function buildTerrain() {
        const posList = [], types = [];
        const isMobile = window.innerWidth < 768;
        const targetPoints = isMobile ? 18000 : 40000;
        let current = 0;

        while (current < targetPoints) {
            const testLng = minLng + Math.random() * (maxLng - minLng);
            const testLat = minLat + Math.random() * (maxLat - minLat);
            const dist = Math.hypot(testLng - centerLng, testLat - centerLat);
            if (dist > sphereRadius) continue;
            
            if (dist / sphereRadius > 0.90 && Math.random() > Math.pow((1.0 - dist / sphereRadius) / 0.10, 1.5)) continue;

            let y = 0.0, typeVal = 0.0;
            if (isFallback) {
                const terr = getTerritory(testLng, testLat);
                if (terr === "COLOMBIA") { 
                    const hBase = getRealisticHeight(testLng, testLat);
                    const altitudeBias = 0.25 + 0.75 * (hBase / 2.0);
                    if (Math.random() > altitudeBias) continue;
                    y = hBase; typeVal = 2.0; 
                }
                else if (terr === "NEIGHBOR") { 
                    if (Math.random() > 0.20) continue;
                    y = getRealisticHeight(testLng, testLat); typeVal = 1.0; 
                }
                else { 
                    // RESTORED OCEAN FALLBACK
                    if (Math.random() > 0.075) continue; 
                    y = -0.01; typeVal = 0.0; 
                } 
            } else {
                const pixel = lngLatToPixel(testLng, testLat);
                const idx = (pixel.v * 512 + pixel.u) * 4;
                const r = terrPixelData[idx], g = terrPixelData[idx + 1], b = terrPixelData[idx + 2], elevRaw = elevPixelData[idx];
                
                // Strict check for QGIS Red channel (Colombia)
                if (r > 150 && g < 100 && b < 100) { 
                    const altitudeBias = 0.25 + 0.75 * (elevRaw / 255.0);
                    if (Math.random() > altitudeBias) continue;
                    y = (elevRaw / 255.0) * 1.5 * 0.80; typeVal = 2.0; 
                }
                // Strict check for QGIS Blue channel (Neighbors)
                else if (b > 150 && r < 100 && g < 100) { 
                    if (Math.random() > 0.20) continue;
                    y = (elevRaw / 255.0) * 1.5 * 0.80; typeVal = 1.0; 
                }
                // Ocean / Everything else
                else { 
                    // RESTORED OCEAN PIXEL READING
                    if (Math.random() > 0.075) continue; 
                    y = -0.01; typeVal = 0.0; 
                } 
            }
            
            const x = ((testLng - minLng) / (maxLng - minLng) - 0.5) * scaleFactor;
            const z = -(((testLat - minLat) / (maxLat - minLat) - 0.5)) * scaleFactor;
            posList.push(new THREE.Vector3(x, y, z));
            types.push(typeVal);
            current++;
        }

        const geo = new THREE.IcosahedronGeometry(0.016, 0);
        const typesArr = new Float32Array(posList.length);
        const elevArr = new Float32Array(posList.length);
        for(let i=0; i<posList.length; i++) { typesArr[i] = types[i]; elevArr[i] = posList[i].y; }
        
        geo.setAttribute('aType', new THREE.InstancedBufferAttribute(typesArr, 1));
        geo.setAttribute('aElevation', new THREE.InstancedBufferAttribute(elevArr, 1));

        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
        
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uSize = { value: (isMobile ? 6.0 : 4.0) * Math.min(window.devicePixelRatio, 2) };
            mat.userData.shader = shader;
            
            shader.vertexShader = `
                attribute float aType;
                attribute float aElevation;
                varying float vElevation;
                varying float vType;
                uniform float uTime;
                uniform float uSize;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vType = aType;
                vElevation = aElevation;
                transformed *= (uSize / 4.0);
                
                vec4 iPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float sway = (aType < 1.5) ? 0.04 : 0.14;
                float wave = sin(uTime * 1.4 + iPos.x * 1.1 + iPos.z * 1.1) * cos(uTime * 1.0 + iPos.x * 0.7) * 0.06;
                
                if (aType > 0.5) { 
                    transformed.x += aElevation * wave * sway; 
                    transformed.z += aElevation * wave * sway * 0.4; 
                } else { 
                    float oW = sin(iPos.x * 2.2 + uTime * 1.6) * cos(iPos.z * 2.2 + uTime * 1.2) * 0.035; 
                    transformed.y += oW; 
                    vElevation += oW; 
                }
                `
            );

            shader.fragmentShader = `
                varying float vElevation;
                varying float vType;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `
                vec3 customColor = vec3(0.0);
                
                if (vType < 0.5) {
                    // OCEAN (Type 0.0) - A subtle sandy/watery beige to contrast with the land
                    customColor = vec3(0.890, 0.855, 0.780); 
                }
                else if (vType < 1.5) {
                    // NEIGHBORS (Type 1.0) - Flat Color #F2E7CF (Converted to GLSL vec3)
                    customColor = vec3(0.949, 0.906, 0.812); 
                } 
                else {
                    // COLOMBIA (Type 2.0) - Earth Green fading to Charcoal
                    float nH = clamp(vElevation / 0.70, 0.0, 1.0);
                    vec3 c0 = vec3(0.533, 0.608, 0.502); // Earth Green (#889B80)
                    vec3 c1 = vec3(0.702, 0.651, 0.525); // Soft Pencil Tan
                    vec3 c2 = vec3(0.553, 0.482, 0.380); // Earthy Brown
                    vec3 c3 = vec3(0.361, 0.302, 0.239); // Sepia
                    vec3 c4 = vec3(0.200, 0.169, 0.149); // Dark Charcoal
                    
                    if (nH < 0.25) customColor = mix(c0, c1, nH / 0.25);
                    else if (nH < 0.50) customColor = mix(c1, c2, (nH - 0.25)/0.25);
                    else if (nH < 0.75) customColor = mix(c2, c3, (nH - 0.50)/0.25);
                    else customColor = mix(c3, c4, (nH - 0.75)/0.25);
                }
                
                vec4 diffuseColor = vec4(customColor, opacity);
                `
            );
        };
        
        instancedMesh = new THREE.InstancedMesh(geo, mat, posList.length);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < posList.length; i++) {
            dummy.position.copy(posList[i]); dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        scene.add(instancedMesh);
    }
    
    buildTerrain();

    // Center marker
    const centerMarker = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x2d5a3f }));
    centerMarker.position.y = 0.5;
    scene.add(centerMarker);

    // --- Ambient Birds ---
    const mapWidth = scaleFactor;
    const birdsCount = 40;
    const birdsGeo = new THREE.BufferGeometry();
    const birdsPos = new Float32Array(birdsCount * 3);
    const birdsBaseY = new Float32Array(birdsCount); 
    for(let i = 0; i < birdsCount; i++) {
        birdsPos[i*3] = (Math.random() - 0.5) * mapWidth;       
        const height = 1.0 + Math.random() * 1.5; 
        birdsPos[i*3+1] = height;                              
        birdsBaseY[i] = height;                                
        birdsPos[i*3+2] = (Math.random() - 0.5) * mapWidth;     
    }
    birdsGeo.setAttribute('position', new THREE.BufferAttribute(birdsPos, 3));
    const birdsMat = new THREE.PointsMaterial({ color: 0x4a433a, size: 0.05, transparent: true, depthWrite: false });
    birdsMat.onBeforeCompile = (shader) => {
        shader.uniforms.mapWidth = { value: mapWidth };
        shader.vertexShader = `varying vec3 vPos;` + shader.vertexShader.replace(`#include <begin_vertex>`, `#include <begin_vertex>\n vPos = position;`);
        shader.fragmentShader = `uniform float mapWidth; varying vec3 vPos;` + shader.fragmentShader.replace(
            `vec4 diffuseColor = vec4( diffuse, opacity );`,
            `float dist = length(vPos.xz); float edgeFade = smoothstep(mapWidth * 0.5, mapWidth * 0.4, dist); vec4 diffuseColor = vec4( diffuse, opacity * edgeFade );`
        );
    };
    const flockOfBirds = new THREE.Points(birdsGeo, birdsMat);
    scene.add(flockOfBirds);

    // --- Custom Drone Camera Controller ---
    const camState = { targetX: 0, targetZ: 2, targetYaw: 0, zoom: 0.3 };
    let isDragging = false, lastMousePos = { x: 0, y: 0 }, touchStartDist = 0;

    const innerLimit = mapWidth * 0.25; 
    const outerLimit = mapWidth * 0.45; 
    function applyFriction(currentPos, move) {
        if (currentPos > innerLimit && move > 0) return move * Math.max(0, 1.0 - ((currentPos - innerLimit) / (outerLimit - innerLimit)));
        if (currentPos < -innerLimit && move < 0) return move * Math.max(0, 1.0 - ((Math.abs(currentPos) - innerLimit) / (outerLimit - innerLimit)));
        return move;
    }

    function handleDown(x, y) { isDragging = true; lastMousePos = { x, y }; }
    function handleMove(x, y) {
        if (!isDragging) return;
        const deltaX = x - lastMousePos.x, deltaY = y - lastMousePos.y;
        
        const cenitalProgress = Math.max(0, Math.min(1, (camState.zoom - 0.8) / 0.2));
        camState.targetYaw += deltaX * (0.0012 * (1.0 - cenitalProgress));

        const baseSpeed = 0.0026; 
        const zoomComp = 1.0 + (camState.zoom * 1.5); 

        const moveDistY = deltaY * baseSpeed * zoomComp;
        const moveDistX = -deltaX * baseSpeed * zoomComp * cenitalProgress;

        let moveX = (-Math.sin(camState.targetYaw) * moveDistY) + (Math.cos(camState.targetYaw) * moveDistX);
        let moveZ = (-Math.cos(camState.targetYaw) * moveDistY) + (-Math.sin(camState.targetYaw) * moveDistX);

        camState.targetX += applyFriction(camState.targetX, moveX);
        camState.targetZ += applyFriction(camState.targetZ, moveZ);
        lastMousePos = { x, y };
    }

    window.addEventListener('pointerdown', (e) => handleDown(e.clientX, e.clientY));
    window.addEventListener('pointerup', () => isDragging = false);
    window.addEventListener('pointermove', (e) => handleMove(e.clientX, e.clientY));
    window.addEventListener('wheel', (e) => { camState.zoom = Math.max(0, Math.min(1, camState.zoom + e.deltaY * 0.0003)); });
    
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) handleDown(e.touches[0].clientX, e.touches[0].clientY);
        else if (e.touches.length === 2) { isDragging = false; touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        else if (e.touches.length === 2) {
            const curDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            camState.zoom = Math.max(0, Math.min(1, camState.zoom + (touchStartDist - curDist) * 0.0015));
            touchStartDist = curDist; 
        }
    });

    const cursorElement = document.querySelector('#custom-cursor');
    let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2, cursorRot = 0;
    window.addEventListener('mousemove', (e) => { cursorX = e.clientX; cursorY = e.clientY; });
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    // --- Render Loop ---
    const lerp = (s, e, f) => s + (e - s) * f;
    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now() * 0.001; 
        
        if (instancedMesh && instancedMesh.material.userData.shader) instancedMesh.material.userData.shader.uniforms.uTime.value = time;

        const positions = flockOfBirds.geometry.attributes.position.array;
        for(let i = 0; i < birdsCount; i++) {
            positions[i*3] += 0.005; 
            positions[i*3+2] += 0.005;   
            positions[i*3+1] = birdsBaseY[i] + Math.sin(time * 2.0 + i) * 0.02;
            if (positions[i*3] > mapWidth/2) positions[i*3] -= mapWidth;
            if (positions[i*3+2] > mapWidth/2) positions[i*3+2] -= mapWidth;
        }
        flockOfBirds.geometry.attributes.position.needsUpdate = true;

        const targetHeight = lerp(2.0, 9.0, camState.zoom);
        const targetPitch = lerp(-Math.PI / 4, -Math.PI / 2, Math.min(camState.zoom / 0.8, 1.0));

        const lastCamX = camera.position.x, lastCamZ = camera.position.z;
        camera.position.x = lerp(camera.position.x, camState.targetX, 0.035);
        camera.position.z = lerp(camera.position.z, camState.targetZ, 0.035);
        camera.position.y = lerp(camera.position.y, targetHeight, 0.035);
        camera.rotation.x = lerp(camera.rotation.x, targetPitch, 0.035);
        camera.rotation.y = lerp(camera.rotation.y, camState.targetYaw, 0.035);

        const camVelX = camera.position.x - lastCamX, camVelZ = camera.position.z - lastCamZ;
        if (Math.abs(camVelX) > 0.0005 || Math.abs(camVelZ) > 0.0005) {
            cursorRot = Math.atan2(camVelZ, camVelX) * (180 / Math.PI) + 90;
        }
        cursorElement.style.transform = `translate(${cursorX}px, ${cursorY}px) rotate(${cursorRot}deg)`;

        renderer.render(scene, camera);
    }
    animate();
}

loadAssetsAndStart();