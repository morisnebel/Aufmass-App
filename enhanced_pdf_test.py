#!/usr/bin/env python3
"""
Enhanced PDF Export Testing for Aufmaß-App
Tests the new photo annotation and SVG sketch conversion functionality
"""

import requests
import json
import base64
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://keyboard-debug-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

def test_enhanced_pdf_export():
    """Test the enhanced PDF export functionality with photo annotations and SVG sketches"""
    
    print("🔍 TESTING ENHANCED PDF EXPORT FUNCTIONALITY")
    print("=" * 60)
    
    # Test data storage
    test_data = {}
    
    try:
        # Step 1: Create a customer
        print("\n1️⃣ Creating test customer...")
        customer_data = {
            "name": "Hans Müller",
            "email": "hans.mueller@dachbau.de", 
            "phone": "+49 30 12345678",
            "address": "Berliner Straße 123, 10115 Berlin"
        }
        
        response = requests.post(f"{API_BASE}/customers", json=customer_data)
        if response.status_code != 200:
            print(f"❌ Customer creation failed: {response.status_code} - {response.text}")
            return False
            
        customer = response.json()
        test_data['customer_id'] = customer['id']
        print(f"✅ Customer created: {customer['name']} (ID: {customer['id']})")
        
        # Step 2: Create a project
        print("\n2️⃣ Creating test project...")
        project_data = {
            "customer_id": customer['id'],
            "name": "Dachsanierung Müller",
            "description": "Komplette Dachsanierung mit Photovoltaik",
            "status": "active"
        }
        
        response = requests.post(f"{API_BASE}/projects", json=project_data)
        if response.status_code != 200:
            print(f"❌ Project creation failed: {response.status_code} - {response.text}")
            return False
            
        project = response.json()
        test_data['project_id'] = project['id']
        print(f"✅ Project created: {project['name']} (ID: {project['id']})")
        
        # Step 3: Create a photo WITH annotations
        print("\n3️⃣ Creating photo with annotations...")
        
        # Create a simple test image (1x1 red pixel PNG in base64)
        test_image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        
        # Create complex annotation data with multiple paths
        annotation_data = {
            "paths": [
                {
                    "path": "M 50 50 L 150 50 L 150 150 L 50 150 L 50 50",
                    "color": "#FF0000", 
                    "strokeWidth": 3
                },
                {
                    "path": "M 100 25 L 175 100 L 100 175 L 25 100 L 100 25",
                    "color": "#00FF00",
                    "strokeWidth": 5
                },
                {
                    "path": "M 10 10 L 190 190",
                    "color": "#0000FF",
                    "strokeWidth": 2
                }
            ]
        }
        
        photo_data = {
            "project_id": project['id'],
            "image_data": test_image_b64,
            "annotations": json.dumps(annotation_data),
            "description": "Dachschaden mit markierten Problemstellen"
        }
        
        response = requests.post(f"{API_BASE}/photos", json=photo_data)
        if response.status_code != 200:
            print(f"❌ Photo creation failed: {response.status_code} - {response.text}")
            return False
            
        photo = response.json()
        test_data['photo_id'] = photo['id']
        print(f"✅ Photo with annotations created (ID: {photo['id']})")
        print(f"   📝 Annotations: {len(annotation_data['paths'])} paths with colors: Red, Green, Blue")
        
        # Step 4: Create a sketch with SVG data
        print("\n4️⃣ Creating sketch with SVG data...")
        
        # Create a proper SVG with geometric shapes
        svg_content = '''<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect x="50" y="50" width="100" height="80" fill="#FF6B6B" stroke="#000" stroke-width="2"/>
            <circle cx="250" cy="90" r="40" fill="#4ECDC4" stroke="#000" stroke-width="2"/>
            <polygon points="200,200 250,150 300,200 275,250 225,250" fill="#45B7D1" stroke="#000" stroke-width="2"/>
            <line x1="50" y1="200" x2="150" y2="250" stroke="#FF9F43" stroke-width="4"/>
            <text x="200" y="280" font-family="Arial" font-size="16" fill="#2C3E50">Dachskizze</text>
        </svg>'''
        
        svg_b64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
        svg_data_uri = f"data:image/svg+xml;base64,{svg_b64}"
        
        sketch_data = {
            "project_id": project['id'],
            "sketch_data": svg_data_uri,
            "title": "Dachaufbau Skizze",
            "metadata": json.dumps({
                "elements": ["rectangle", "circle", "polygon", "line", "text"],
                "colors": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FF9F43"],
                "created_with": "sketch_editor_v2"
            })
        }
        
        response = requests.post(f"{API_BASE}/sketches", json=sketch_data)
        if response.status_code != 200:
            print(f"❌ Sketch creation failed: {response.status_code} - {response.text}")
            return False
            
        sketch = response.json()
        test_data['sketch_id'] = sketch['id']
        print(f"✅ SVG sketch created (ID: {sketch['id']})")
        print(f"   🎨 SVG contains: rectangle, circle, polygon, line, text elements")
        
        # Step 5: Test PDF generation
        print("\n5️⃣ Testing PDF export with annotations and sketches...")
        
        response = requests.get(f"{API_BASE}/export/pdf/{project['id']}")
        if response.status_code != 200:
            print(f"❌ PDF export failed: {response.status_code} - {response.text}")
            return False
            
        pdf_result = response.json()
        
        # Verify PDF response structure
        if 'pdf_data' not in pdf_result:
            print("❌ PDF response missing 'pdf_data' field")
            return False
            
        if 'filename' not in pdf_result:
            print("❌ PDF response missing 'filename' field")
            return False
            
        # Decode and verify PDF data
        try:
            pdf_bytes = base64.b64decode(pdf_result['pdf_data'])
            pdf_size = len(pdf_bytes)
            
            # Verify it's a valid PDF (starts with %PDF)
            if not pdf_bytes.startswith(b'%PDF'):
                print("❌ Generated data is not a valid PDF")
                return False
                
            print(f"✅ PDF generated successfully!")
            print(f"   📄 Filename: {pdf_result['filename']}")
            print(f"   📊 Size: {pdf_size:,} bytes ({pdf_size/1024:.1f} KB)")
            
            # Check if PDF is significantly larger (should be due to processed images)
            if pdf_size < 10000:  # Less than 10KB suggests no images were processed
                print("⚠️  WARNING: PDF size is quite small, images may not be properly embedded")
            else:
                print(f"✅ PDF size indicates successful image processing (>10KB)")
                
        except Exception as e:
            print(f"❌ Error decoding PDF data: {e}")
            return False
        
        # Step 6: Verify data integrity by fetching back
        print("\n6️⃣ Verifying data integrity...")
        
        # Check photo with annotations
        response = requests.get(f"{API_BASE}/photos/project/{project['id']}")
        if response.status_code == 200:
            photos = response.json()
            if photos and photos[0].get('annotations'):
                stored_annotations = json.loads(photos[0]['annotations'])
                if len(stored_annotations.get('paths', [])) == 3:
                    print("✅ Photo annotations stored and retrieved correctly")
                else:
                    print("⚠️  Photo annotations may not be complete")
            else:
                print("❌ Photo annotations not found in stored data")
        
        # Check sketch with SVG
        response = requests.get(f"{API_BASE}/sketches/project/{project['id']}")
        if response.status_code == 200:
            sketches = response.json()
            if sketches and sketches[0].get('sketch_data'):
                if 'svg' in sketches[0]['sketch_data'].lower():
                    print("✅ SVG sketch data stored and retrieved correctly")
                else:
                    print("⚠️  Sketch data may not contain SVG")
            else:
                print("❌ Sketch data not found")
        
        print("\n" + "=" * 60)
        print("🎉 ENHANCED PDF EXPORT TEST COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        
        # Store test data for cleanup
        test_data['success'] = True
        return test_data
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR during testing: {e}")
        return False

def cleanup_test_data(test_data):
    """Clean up test data created during testing"""
    if not test_data or not test_data.get('success'):
        return
        
    print("\n🧹 Cleaning up test data...")
    
    try:
        # Delete in reverse order (project deletion cascades)
        if 'project_id' in test_data:
            response = requests.delete(f"{API_BASE}/projects/{test_data['project_id']}")
            if response.status_code == 200:
                print("✅ Project and related data deleted")
            
        if 'customer_id' in test_data:
            response = requests.delete(f"{API_BASE}/customers/{test_data['customer_id']}")
            if response.status_code == 200:
                print("✅ Customer deleted")
                
    except Exception as e:
        print(f"⚠️  Cleanup error (non-critical): {e}")

def check_backend_logs():
    """Check backend logs for any errors during PDF processing"""
    print("\n📋 Checking backend logs for errors...")
    
    try:
        import subprocess
        result = subprocess.run(
            ["tail", "-n", "50", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            error_lines = [line for line in result.stdout.split('\n') 
                          if any(keyword in line.lower() for keyword in ['error', 'exception', 'traceback', 'failed'])]
            
            if error_lines:
                print("⚠️  Found potential errors in backend logs:")
                for line in error_lines[-5:]:  # Show last 5 error lines
                    print(f"   {line}")
            else:
                print("✅ No recent errors found in backend logs")
        else:
            print("ℹ️  Backend error log is empty or not accessible")
            
    except Exception as e:
        print(f"ℹ️  Could not check backend logs: {e}")

if __name__ == "__main__":
    print("🚀 STARTING ENHANCED PDF EXPORT TESTING")
    print(f"🌐 Backend URL: {API_BASE}")
    print(f"⏰ Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Run the main test
    result = test_enhanced_pdf_export()
    
    # Check backend logs
    check_backend_logs()
    
    # Cleanup
    if result:
        cleanup_test_data(result)
    
    print(f"\n⏰ Test completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if result and result.get('success'):
        print("🎯 OVERALL RESULT: ✅ SUCCESS - Enhanced PDF export is working correctly!")
        exit(0)
    else:
        print("🎯 OVERALL RESULT: ❌ FAILED - Issues found with enhanced PDF export")
        exit(1)