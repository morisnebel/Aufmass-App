#!/usr/bin/env python3
"""
Comprehensive Sketch Metadata Testing
Testing all scenarios from the review request
"""

import requests
import json
import base64
import sys
from datetime import datetime

BACKEND_URL = "https://protractor-drag.preview.emergentagent.com/api"

def comprehensive_sketch_test():
    """Test all scenarios from the review request"""
    
    print("🔍 COMPREHENSIVE SKETCH METADATA TESTING")
    print("=" * 70)
    
    # Test data from review request
    test_project_id = "test_project_id"
    test_sketch_data = "data:image/png;base64,iVBORw0KGg..."
    
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
    
    print(f"📝 Project ID: {test_project_id}")
    print(f"📝 Metadata: {metadata_json}")
    print()
    
    # SCENARIO 1: Create sketch with metadata
    print("🔸 SCENARIO 1: POST /api/sketches - Create sketch with metadata")
    print("-" * 60)
    
    create_payload = {
        "project_id": test_project_id,
        "title": "Test Skizze",
        "sketch_data": test_sketch_data,
        "metadata": metadata_json
    }
    
    print(f"📤 Sending payload with metadata field")
    print(f"📤 Payload keys: {list(create_payload.keys())}")
    
    try:
        response = requests.post(f"{BACKEND_URL}/sketches", json=create_payload, timeout=10)
        print(f"📥 Status Code: {response.status_code}")
        print(f"📥 Response Time: {response.elapsed.total_seconds():.3f}s")
        
        if response.status_code == 200:
            sketch_data = response.json()
            sketch_id = sketch_data.get('id')
            
            print(f"✅ Sketch created successfully")
            print(f"📋 Sketch ID: {sketch_id}")
            print(f"📋 Response keys: {list(sketch_data.keys())}")
            
            # CRITICAL CHECK: Is metadata in response?
            if 'metadata' in sketch_data:
                print(f"✅ ✅ METADATA FIELD PRESENT in response")
                print(f"📋 Metadata value: {sketch_data['metadata']}")
            else:
                print(f"❌ ❌ METADATA FIELD MISSING from response!")
                print(f"📋 This means the backend model doesn't include metadata field")
            
            print(f"📋 Full response:")
            print(json.dumps(sketch_data, indent=2))
            
        else:
            print(f"❌ Failed to create sketch")
            print(f"📋 Status: {response.status_code}")
            print(f"📋 Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Exception during creation: {e}")
        return False
    
    print()
    
    # SCENARIO 2: Retrieve sketch
    print("🔸 SCENARIO 2: GET /api/sketches/project/{project_id} - Retrieve sketch")
    print("-" * 60)
    
    try:
        response = requests.get(f"{BACKEND_URL}/sketches/project/{test_project_id}", timeout=10)
        print(f"📥 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            sketches = response.json()
            print(f"✅ Retrieved {len(sketches)} sketches")
            
            if sketches:
                sketch = sketches[0]
                print(f"📋 Sketch keys: {list(sketch.keys())}")
                
                # CRITICAL CHECK: Is metadata in retrieved sketch?
                if 'metadata' in sketch:
                    metadata_value = sketch['metadata']
                    print(f"✅ ✅ METADATA FIELD PRESENT in retrieved sketch")
                    print(f"📋 Metadata type: {type(metadata_value)}")
                    print(f"📋 Metadata value: {metadata_value}")
                    
                    # Can it be parsed as JSON?
                    if isinstance(metadata_value, str):
                        try:
                            parsed_metadata = json.loads(metadata_value)
                            print(f"✅ ✅ METADATA CAN BE PARSED as JSON")
                            print(f"📋 Parsed metadata:")
                            print(json.dumps(parsed_metadata, indent=2))
                        except json.JSONDecodeError as e:
                            print(f"❌ ❌ METADATA CANNOT BE PARSED as JSON: {e}")
                    else:
                        print(f"📋 Metadata is not a string: {metadata_value}")
                else:
                    print(f"❌ ❌ METADATA FIELD MISSING from retrieved sketch!")
                    print(f"📋 Available fields: {list(sketch.keys())}")
                
                print(f"📋 Full retrieved sketch:")
                print(json.dumps(sketch, indent=2))
            else:
                print(f"❌ No sketches found for project")
                
        else:
            print(f"❌ Failed to retrieve sketches")
            print(f"📋 Status: {response.status_code}")
            print(f"📋 Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception during retrieval: {e}")
    
    print()
    
    # SCENARIO 3: Check MongoDB directly
    print("🔸 SCENARIO 3: MongoDB Direct Query")
    print("-" * 60)
    
    try:
        import pymongo
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        
        async def check_mongodb():
            client = AsyncIOMotorClient('mongodb://localhost:27017')
            db = client['test_database']
            
            sketches = await db.sketches.find({'project_id': test_project_id}).to_list(10)
            
            print(f"📋 Found {len(sketches)} documents in MongoDB")
            
            for i, doc in enumerate(sketches):
                print(f"📋 Document {i+1} keys: {list(doc.keys())}")
                
                # CRITICAL CHECK: Is metadata stored in MongoDB?
                if 'metadata' in doc:
                    print(f"✅ ✅ METADATA FIELD FOUND in MongoDB document")
                    print(f"📋 Metadata value: {doc['metadata']}")
                else:
                    print(f"❌ ❌ METADATA FIELD NOT STORED in MongoDB!")
                    print(f"📋 This confirms the backend model doesn't include metadata")
                
                print(f"📋 Full MongoDB document:")
                # Convert ObjectId to string for JSON serialization
                doc_copy = dict(doc)
                doc_copy['_id'] = str(doc_copy['_id'])
                print(json.dumps(doc_copy, indent=2, default=str))
            
            client.close()
        
        asyncio.run(check_mongodb())
        
    except Exception as e:
        print(f"❌ MongoDB query exception: {e}")
    
    print()
    
    # SCENARIO 4: Update sketch with new metadata
    print("🔸 SCENARIO 4: PUT /api/sketches/{sketch_id} - Update sketch")
    print("-" * 60)
    
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
        
        updated_metadata_json = json.dumps(updated_metadata)
        
        update_payload = {
            "project_id": test_project_id,
            "title": "Test Skizze Updated",
            "sketch_data": test_sketch_data,
            "metadata": updated_metadata_json
        }
        
        print(f"📤 Sending update with new metadata")
        print(f"📤 New metadata: {updated_metadata_json}")
        
        try:
            response = requests.put(f"{BACKEND_URL}/sketches/{sketch_id}", json=update_payload, timeout=10)
            print(f"📥 Status Code: {response.status_code}")
            
            if response.status_code == 200:
                updated_sketch = response.json()
                print(f"✅ Sketch updated successfully")
                print(f"📋 Response keys: {list(updated_sketch.keys())}")
                
                # CRITICAL CHECK: Is metadata in update response?
                if 'metadata' in updated_sketch:
                    print(f"✅ ✅ METADATA FIELD PRESENT in update response")
                    print(f"📋 Updated metadata: {updated_sketch['metadata']}")
                    
                    # Check if it's the new metadata
                    if updated_metadata_json in str(updated_sketch.get('metadata', '')):
                        print(f"✅ ✅ METADATA WAS UPDATED correctly")
                    else:
                        print(f"❌ ❌ METADATA WAS NOT UPDATED correctly")
                else:
                    print(f"❌ ❌ METADATA FIELD MISSING from update response!")
                
                print(f"📋 Full update response:")
                print(json.dumps(updated_sketch, indent=2))
                
            else:
                print(f"❌ Failed to update sketch")
                print(f"📋 Status: {response.status_code}")
                print(f"📋 Error: {response.text}")
                
        except Exception as e:
            print(f"❌ Exception during update: {e}")
    else:
        print(f"❌ Cannot test update - no sketch_id available")
    
    print()
    
    # SUMMARY
    print("📊 TESTING SUMMARY")
    print("=" * 70)
    print("❌ CRITICAL ISSUE IDENTIFIED:")
    print("   The backend Sketch model does NOT include a 'metadata' field!")
    print()
    print("🔍 ROOT CAUSE ANALYSIS:")
    print("   1. Frontend sends metadata in POST/PUT requests")
    print("   2. Backend Sketch model only has: id, project_id, sketch_data, title, created_at")
    print("   3. The metadata field is ignored/dropped by Pydantic model validation")
    print("   4. MongoDB only stores the fields defined in the model")
    print("   5. Frontend cannot retrieve sketch elements because metadata is never saved")
    print()
    print("🛠️  REQUIRED FIX:")
    print("   Add 'metadata: Optional[str] = None' to the Sketch model in backend/server.py")
    print()
    print("📋 IMPACT:")
    print("   - Sketch elements (lines, circles, etc.) are not saved")
    print("   - Frontend cannot restore saved sketches")
    print("   - Users lose their drawing work when reopening sketches")

if __name__ == "__main__":
    print("🚀 STARTING COMPREHENSIVE SKETCH METADATA TESTING")
    print("=" * 70)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check backend service
    try:
        response = requests.get(f"{BACKEND_URL}/customers", timeout=5)
        if response.status_code == 200:
            print("✅ Backend service is running")
        else:
            print(f"❌ Backend service issue: {response.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Backend not accessible: {e}")
        sys.exit(1)
    
    print()
    
    # Run comprehensive tests
    comprehensive_sketch_test()
    
    print()
    print("✅ COMPREHENSIVE TESTING COMPLETED")