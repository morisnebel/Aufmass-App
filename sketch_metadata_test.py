#!/usr/bin/env python3
"""
Sketch Metadata Testing - Specific test for sketch save/load problem
Testing if metadata field is properly saved and retrieved
"""

import requests
import json
import base64
import sys
import subprocess
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://pdf-fix-2.preview.emergentagent.com/api"

def test_sketch_metadata_issue():
    """Test the specific sketch metadata save/load issue reported by user"""
    
    print("🔍 TESTING SKETCH METADATA SAVE/LOAD ISSUE")
    print("=" * 60)
    
    # Test data exactly as specified in the review request
    test_project_id = "test_project_id"
    test_sketch_data = "data:image/png;base64,iVBORw0KGg..."
    
    # Metadata as specified in review request
    test_metadata = {
        "elements": [
            {
                "id": "test1",
                "type": "line", 
                "data": {"x1": 10, "y1": 10, "x2": 100, "y2": 100},
                "color": "#FF0000",
                "strokeWidth": 3,
                "rotation": 0
            }
        ],
        "backgroundImage": None
    }
    
    metadata_json = json.dumps(test_metadata)
    
    print(f"📝 Testing with Project ID: {test_project_id}")
    print(f"📝 Metadata JSON: {metadata_json}")
    print()
    
    # 1. CREATE SKETCH WITH METADATA
    print("1️⃣ POST /api/sketches - Create sketch with metadata")
    print("-" * 50)
    
    create_payload = {
        "project_id": test_project_id,
        "title": "Test Skizze",
        "sketch_data": test_sketch_data,
        "metadata": metadata_json
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/sketches", json=create_payload, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Time: {response.elapsed.total_seconds():.3f}s")
        
        if response.status_code == 200:
            sketch_data = response.json()
            sketch_id = sketch_data.get('id')
            print(f"✅ Sketch created with ID: {sketch_id}")
            
            # CRITICAL CHECK: Is metadata field in response?
            if 'metadata' in sketch_data:
                print(f"✅ Metadata field present in response")
                print(f"📋 Metadata: {sketch_data['metadata']}")
            else:
                print(f"❌ CRITICAL ISSUE: Metadata field NOT in response!")
                print(f"📋 Response fields: {list(sketch_data.keys())}")
                print(f"📋 Full response: {json.dumps(sketch_data, indent=2)}")
            
        else:
            print(f"❌ Failed to create sketch: {response.status_code}")
            print(f"📋 Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False
    
    print()
    
    # 2. RETRIEVE SKETCH
    print("2️⃣ GET /api/sketches/project/{project_id} - Retrieve sketch")
    print("-" * 50)
    
    try:
        response = requests.get(f"{BACKEND_URL}/sketches/project/{test_project_id}", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            sketches = response.json()
            print(f"✅ Retrieved {len(sketches)} sketches")
            
            if sketches:
                sketch = sketches[0]
                
                # CRITICAL CHECK: Is metadata field present?
                if 'metadata' in sketch:
                    metadata_value = sketch['metadata']
                    print(f"✅ Metadata field present")
                    print(f"📋 Metadata type: {type(metadata_value)}")
                    print(f"📋 Metadata value: {metadata_value}")
                    
                    # Can it be parsed as JSON?
                    if isinstance(metadata_value, str) and metadata_value:
                        try:
                            parsed = json.loads(metadata_value)
                            print(f"✅ Metadata can be parsed as JSON")
                            print(f"📋 Parsed: {json.dumps(parsed, indent=2)}")
                        except:
                            print(f"❌ Metadata cannot be parsed as JSON")
                    elif not metadata_value:
                        print(f"❌ Metadata field is empty!")
                else:
                    print(f"❌ CRITICAL ISSUE: Metadata field NOT in retrieved sketch!")
                    print(f"📋 Available fields: {list(sketch.keys())}")
                
                print(f"📋 Full sketch: {json.dumps(sketch, indent=2)}")
            else:
                print(f"❌ No sketches found")
                
        else:
            print(f"❌ Failed to retrieve: {response.status_code}")
            print(f"📋 Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")
    
    print()
    
    # 3. CHECK MONGODB DIRECTLY
    print("3️⃣ MongoDB Direct Query")
    print("-" * 50)
    
    try:
        # Check what's actually stored in MongoDB
        mongo_cmd = [
            "mongo", "test_database", "--quiet", "--eval",
            f"db.sketches.find({{'project_id': '{test_project_id}'}}).forEach(printjson)"
        ]
        
        result = subprocess.run(mongo_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            print(f"✅ MongoDB query successful")
            print(f"📋 MongoDB document:")
            print(result.stdout)
            
            # Check if metadata is in the document
            if 'metadata' in result.stdout:
                print(f"✅ Metadata field found in MongoDB")
            else:
                print(f"❌ CRITICAL: Metadata field NOT found in MongoDB!")
                
        else:
            print(f"❌ MongoDB query failed: {result.stderr}")
            
    except Exception as e:
        print(f"❌ MongoDB query exception: {e}")
    
    print()
    
    # 4. UPDATE SKETCH
    print("4️⃣ PUT /api/sketches/{sketch_id} - Update sketch")
    print("-" * 50)
    
    if 'sketch_id' in locals() and sketch_id:
        updated_metadata = {
            "elements": [
                {
                    "id": "test2",
                    "type": "circle",
                    "data": {"cx": 50, "cy": 50, "r": 30},
                    "color": "#0000FF", 
                    "strokeWidth": 2,
                    "rotation": 0
                }
            ],
            "backgroundImage": None
        }
        
        update_payload = {
            "project_id": test_project_id,
            "title": "Test Skizze Updated",
            "sketch_data": test_sketch_data,
            "metadata": json.dumps(updated_metadata)
        }
        
        try:
            response = requests.put(f"{BACKEND_URL}/sketches/{sketch_id}", json=update_payload, timeout=10)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                updated_sketch = response.json()
                print(f"✅ Sketch updated")
                
                # Check if metadata was updated
                if 'metadata' in updated_sketch:
                    print(f"✅ Metadata field in update response")
                    print(f"📋 Updated metadata: {updated_sketch['metadata']}")
                else:
                    print(f"❌ CRITICAL: Metadata field NOT in update response!")
                
            else:
                print(f"❌ Update failed: {response.status_code}")
                print(f"📋 Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Update exception: {e}")
    else:
        print(f"❌ Cannot test update - no sketch_id")
    
    print()
    print("🔍 SKETCH METADATA TESTING COMPLETED")
    print("=" * 60)

def check_backend_model():
    """Check the backend Sketch model definition"""
    print("🔧 CHECKING BACKEND SKETCH MODEL")
    print("-" * 40)
    
    try:
        with open('/app/backend/server.py', 'r') as f:
            content = f.read()
            
        # Find Sketch model definition
        if 'class Sketch(BaseModel):' in content:
            print("✅ Found Sketch model definition")
            
            # Extract the model definition
            start = content.find('class Sketch(BaseModel):')
            end = content.find('\nclass ', start + 1)
            if end == -1:
                end = content.find('\n# ', start + 1)
            if end == -1:
                end = start + 500  # fallback
                
            model_def = content[start:end]
            print("📋 Sketch model definition:")
            print(model_def)
            
            # Check if metadata field exists
            if 'metadata' in model_def:
                print("✅ Metadata field found in Sketch model")
            else:
                print("❌ CRITICAL: Metadata field NOT found in Sketch model!")
                print("📋 This is likely the root cause of the issue!")
                
        else:
            print("❌ Could not find Sketch model definition")
            
    except Exception as e:
        print(f"❌ Error checking model: {e}")

if __name__ == "__main__":
    print("🚀 SKETCH METADATA ISSUE TESTING")
    print("=" * 60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check backend service
    try:
        response = requests.get(f"{BACKEND_URL}/customers", timeout=5)
        if response.status_code == 200:
            print("✅ Backend service is running")
        else:
            print(f"❌ Backend service issue: {response.status_code}")
    except Exception as e:
        print(f"❌ Backend not accessible: {e}")
        sys.exit(1)
    
    print()
    
    # Check the model definition first
    check_backend_model()
    print()
    
    # Run the tests
    test_sketch_metadata_issue()