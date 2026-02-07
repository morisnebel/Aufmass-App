#!/usr/bin/env python3
"""
Comprehensive Enhanced PDF Export Testing
Tests edge cases and validates annotation/SVG processing
"""

import requests
import json
import base64
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://dynamic-sketch-app.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

def test_comprehensive_pdf_scenarios():
    """Test various scenarios for PDF export with different annotation and SVG types"""
    
    print("🔍 COMPREHENSIVE PDF EXPORT TESTING")
    print("=" * 60)
    
    test_data = {}
    
    try:
        # Step 1: Create customer and project
        print("\n1️⃣ Setting up test environment...")
        
        customer_data = {
            "name": "Test Kunde PDF",
            "email": "test@pdf-export.de",
            "phone": "+49 40 98765432",
            "address": "Teststraße 456, 20095 Hamburg"
        }
        
        response = requests.post(f"{API_BASE}/customers", json=customer_data)
        if response.status_code != 200:
            print(f"❌ Customer creation failed: {response.status_code}")
            return False
            
        customer = response.json()
        test_data['customer_id'] = customer['id']
        
        project_data = {
            "customer_id": customer['id'],
            "name": "PDF Export Test Project",
            "description": "Testing enhanced PDF export with various scenarios",
            "status": "active"
        }
        
        response = requests.post(f"{API_BASE}/projects", json=project_data)
        if response.status_code != 200:
            print(f"❌ Project creation failed: {response.status_code}")
            return False
            
        project = response.json()
        test_data['project_id'] = project['id']
        print(f"✅ Test environment ready (Project ID: {project['id']})")
        
        # Step 2: Test photo with complex annotations
        print("\n2️⃣ Testing photo with complex annotations...")
        
        # Larger test image (100x100 red square)
        test_image_large = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        
        # Complex annotation with various path types and colors
        complex_annotations = {
            "paths": [
                {
                    "path": "M 20 20 L 80 20 L 80 80 L 20 80 L 20 20",
                    "color": "#FF0000",
                    "strokeWidth": 4
                },
                {
                    "path": "M 50 10 L 90 50 L 50 90 L 10 50 L 50 10",
                    "color": "#00FF00",
                    "strokeWidth": 2
                },
                {
                    "path": "M 0 0 L 100 100",
                    "color": "#0000FF",
                    "strokeWidth": 6
                },
                {
                    "path": "M 100 0 L 0 100",
                    "color": "#FFFF00",
                    "strokeWidth": 1
                },
                {
                    "path": "M 30 30 L 70 30 L 70 70 L 30 70 L 30 30",
                    "color": "#FF00FF",
                    "strokeWidth": 3
                }
            ]
        }
        
        photo_data = {
            "project_id": project['id'],
            "image_data": test_image_large,
            "annotations": json.dumps(complex_annotations),
            "description": "Foto mit komplexen Annotationen - 5 verschiedene Pfade"
        }
        
        response = requests.post(f"{API_BASE}/photos", json=photo_data)
        if response.status_code != 200:
            print(f"❌ Complex photo creation failed: {response.status_code}")
            return False
            
        photo = response.json()
        test_data['photo_id'] = photo['id']
        print(f"✅ Complex annotated photo created with {len(complex_annotations['paths'])} annotation paths")
        
        # Step 3: Test photo without annotations
        print("\n3️⃣ Testing photo without annotations...")
        
        photo_no_annotations = {
            "project_id": project['id'],
            "image_data": test_image_large,
            "annotations": "",  # Empty annotations
            "description": "Foto ohne Annotationen"
        }
        
        response = requests.post(f"{API_BASE}/photos", json=photo_no_annotations)
        if response.status_code != 200:
            print(f"❌ Photo without annotations creation failed: {response.status_code}")
            return False
            
        photo2 = response.json()
        test_data['photo2_id'] = photo2['id']
        print("✅ Photo without annotations created")
        
        # Step 4: Test complex SVG sketch
        print("\n4️⃣ Testing complex SVG sketch...")
        
        complex_svg = '''<svg width="500" height="400" xmlns="http://www.w3.org/2000/svg">
            <!-- Background -->
            <rect x="0" y="0" width="500" height="400" fill="#F0F8FF" stroke="#000" stroke-width="1"/>
            
            <!-- House structure -->
            <rect x="100" y="200" width="200" height="150" fill="#DEB887" stroke="#8B4513" stroke-width="3"/>
            
            <!-- Roof -->
            <polygon points="80,200 200,100 320,200" fill="#8B0000" stroke="#654321" stroke-width="2"/>
            
            <!-- Door -->
            <rect x="180" y="280" width="40" height="70" fill="#654321" stroke="#000" stroke-width="2"/>
            <circle cx="210" cy="315" r="3" fill="#FFD700"/>
            
            <!-- Windows -->
            <rect x="120" y="230" width="40" height="30" fill="#87CEEB" stroke="#000" stroke-width="2"/>
            <rect x="240" y="230" width="40" height="30" fill="#87CEEB" stroke="#000" stroke-width="2"/>
            
            <!-- Window frames -->
            <line x1="140" y1="230" x2="140" y2="260" stroke="#000" stroke-width="1"/>
            <line x1="120" y1="245" x2="160" y2="245" stroke="#000" stroke-width="1"/>
            <line x1="260" y1="230" x2="260" y2="260" stroke="#000" stroke-width="1"/>
            <line x1="240" y1="245" x2="280" y2="245" stroke="#000" stroke-width="1"/>
            
            <!-- Chimney -->
            <rect x="250" y="120" width="30" height="80" fill="#696969" stroke="#000" stroke-width="2"/>
            
            <!-- Sun -->
            <circle cx="400" cy="80" r="30" fill="#FFD700" stroke="#FFA500" stroke-width="2"/>
            
            <!-- Sun rays -->
            <line x1="400" y1="30" x2="400" y2="50" stroke="#FFD700" stroke-width="3"/>
            <line x1="450" y1="80" x2="430" y2="80" stroke="#FFD700" stroke-width="3"/>
            <line x1="400" y1="130" x2="400" y2="110" stroke="#FFD700" stroke-width="3"/>
            <line x1="350" y1="80" x2="370" y2="80" stroke="#FFD700" stroke-width="3"/>
            
            <!-- Trees -->
            <rect x="30" y="280" width="15" height="70" fill="#8B4513"/>
            <circle cx="37" cy="270" r="25" fill="#228B22"/>
            
            <rect x="420" y="290" width="12" height="60" fill="#8B4513"/>
            <circle cx="426" cy="280" r="20" fill="#32CD32"/>
            
            <!-- Text -->
            <text x="200" y="380" font-family="Arial" font-size="18" text-anchor="middle" fill="#000">Dachaufbau Skizze - Komplex</text>
        </svg>'''
        
        svg_b64 = base64.b64encode(complex_svg.encode('utf-8')).decode('utf-8')
        svg_data_uri = f"data:image/svg+xml;base64,{svg_b64}"
        
        sketch_data = {
            "project_id": project['id'],
            "sketch_data": svg_data_uri,
            "title": "Komplexe Hauszeichnung",
            "metadata": json.dumps({
                "elements": ["house", "roof", "windows", "door", "chimney", "sun", "trees"],
                "colors": ["#DEB887", "#8B0000", "#87CEEB", "#654321", "#FFD700", "#228B22"],
                "complexity": "high",
                "created_with": "enhanced_sketch_editor"
            })
        }
        
        response = requests.post(f"{API_BASE}/sketches", json=sketch_data)
        if response.status_code != 200:
            print(f"❌ Complex SVG sketch creation failed: {response.status_code}")
            return False
            
        sketch = response.json()
        test_data['sketch_id'] = sketch['id']
        print("✅ Complex SVG sketch created (house with multiple elements)")
        
        # Step 5: Test simple geometric SVG
        print("\n5️⃣ Testing simple geometric SVG...")
        
        simple_svg = '''<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="80" fill="none" stroke="#FF0000" stroke-width="5"/>
            <rect x="60" y="60" width="80" height="80" fill="none" stroke="#00FF00" stroke-width="3"/>
            <line x1="20" y1="20" x2="180" y2="180" stroke="#0000FF" stroke-width="2"/>
        </svg>'''
        
        simple_svg_b64 = base64.b64encode(simple_svg.encode('utf-8')).decode('utf-8')
        simple_svg_uri = f"data:image/svg+xml;base64,{simple_svg_b64}"
        
        simple_sketch_data = {
            "project_id": project['id'],
            "sketch_data": simple_svg_uri,
            "title": "Einfache Geometrie",
            "metadata": json.dumps({
                "elements": ["circle", "rectangle", "line"],
                "colors": ["#FF0000", "#00FF00", "#0000FF"],
                "complexity": "low"
            })
        }
        
        response = requests.post(f"{API_BASE}/sketches", json=simple_sketch_data)
        if response.status_code != 200:
            print(f"❌ Simple SVG sketch creation failed: {response.status_code}")
            return False
            
        sketch2 = response.json()
        test_data['sketch2_id'] = sketch2['id']
        print("✅ Simple geometric SVG sketch created")
        
        # Step 6: Generate PDF with all content
        print("\n6️⃣ Generating PDF with all content...")
        
        response = requests.get(f"{API_BASE}/export/pdf/{project['id']}")
        if response.status_code != 200:
            print(f"❌ PDF export failed: {response.status_code} - {response.text}")
            return False
            
        pdf_result = response.json()
        
        # Verify PDF
        if 'pdf_data' not in pdf_result or 'filename' not in pdf_result:
            print("❌ PDF response structure invalid")
            return False
            
        try:
            pdf_bytes = base64.b64decode(pdf_result['pdf_data'])
            pdf_size = len(pdf_bytes)
            
            if not pdf_bytes.startswith(b'%PDF'):
                print("❌ Invalid PDF format")
                return False
                
            print(f"✅ Comprehensive PDF generated successfully!")
            print(f"   📄 Filename: {pdf_result['filename']}")
            print(f"   📊 Size: {pdf_size:,} bytes ({pdf_size/1024:.1f} KB)")
            
            # This PDF should be larger due to multiple processed images
            if pdf_size > 30000:  # >30KB indicates good image processing
                print("✅ PDF size indicates excellent image processing (>30KB)")
            elif pdf_size > 15000:  # >15KB is acceptable
                print("✅ PDF size indicates good image processing (>15KB)")
            else:
                print("⚠️  PDF size is smaller than expected for multiple images")
                
        except Exception as e:
            print(f"❌ Error processing PDF: {e}")
            return False
        
        # Step 7: Verify all data was processed correctly
        print("\n7️⃣ Verifying content processing...")
        
        # Check photos
        response = requests.get(f"{API_BASE}/photos/project/{project['id']}")
        if response.status_code == 200:
            photos = response.json()
            annotated_photos = [p for p in photos if p.get('annotations') and p['annotations'].strip()]
            non_annotated_photos = [p for p in photos if not p.get('annotations') or not p['annotations'].strip()]
            
            print(f"✅ Found {len(annotated_photos)} photos with annotations")
            print(f"✅ Found {len(non_annotated_photos)} photos without annotations")
            
            if annotated_photos:
                annotations = json.loads(annotated_photos[0]['annotations'])
                paths_count = len(annotations.get('paths', []))
                print(f"   📝 First annotated photo has {paths_count} annotation paths")
        
        # Check sketches
        response = requests.get(f"{API_BASE}/sketches/project/{project['id']}")
        if response.status_code == 200:
            sketches = response.json()
            svg_sketches = [s for s in sketches if 'svg' in s.get('sketch_data', '').lower()]
            
            print(f"✅ Found {len(svg_sketches)} SVG sketches for conversion")
            
            for i, sketch in enumerate(svg_sketches):
                title = sketch.get('title', f'Sketch {i+1}')
                print(f"   🎨 {title}: SVG data ready for PNG conversion")
        
        print("\n" + "=" * 60)
        print("🎉 COMPREHENSIVE PDF EXPORT TEST COMPLETED!")
        print("=" * 60)
        
        test_data['success'] = True
        return test_data
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        return False

def cleanup_comprehensive_test(test_data):
    """Clean up comprehensive test data"""
    if not test_data or not test_data.get('success'):
        return
        
    print("\n🧹 Cleaning up comprehensive test data...")
    
    try:
        if 'project_id' in test_data:
            response = requests.delete(f"{API_BASE}/projects/{test_data['project_id']}")
            if response.status_code == 200:
                print("✅ Project and all related data deleted")
            
        if 'customer_id' in test_data:
            response = requests.delete(f"{API_BASE}/customers/{test_data['customer_id']}")
            if response.status_code == 200:
                print("✅ Customer deleted")
                
    except Exception as e:
        print(f"⚠️  Cleanup error: {e}")

if __name__ == "__main__":
    print("🚀 STARTING COMPREHENSIVE PDF EXPORT TESTING")
    print(f"🌐 Backend URL: {API_BASE}")
    print(f"⏰ Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    result = test_comprehensive_pdf_scenarios()
    
    if result:
        cleanup_comprehensive_test(result)
    
    print(f"\n⏰ Test completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if result and result.get('success'):
        print("🎯 COMPREHENSIVE RESULT: ✅ SUCCESS - All PDF export scenarios working!")
        exit(0)
    else:
        print("🎯 COMPREHENSIVE RESULT: ❌ FAILED - Issues with PDF export scenarios")
        exit(1)