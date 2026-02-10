#!/usr/bin/env python3
"""
Focused Photo PUT Endpoint Testing for Aufmaß-App
Specifically tests the newly implemented PUT /api/photos/{photo_id} endpoint
"""

import requests
import json
import base64
from datetime import datetime

# Configuration
BASE_URL = "https://roof-calc-7.preview.emergentagent.com/api"

def create_test_image_data():
    """Create a simple base64 encoded test image"""
    # Simple 1x1 pixel PNG in base64
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

def test_photo_put_endpoint_focused():
    """Focused test for Photo PUT endpoint functionality"""
    print("🎯 FOCUSED PHOTO PUT ENDPOINT TEST")
    print("=" * 50)
    
    # Setup: Create customer and project
    customer_data = {
        "name": "PUT Test Kunde",
        "email": "put.test@example.de",
        "phone": "+49 171 1234567",
        "address": "PUT Test Straße 1, 12345 Berlin"
    }
    
    customer_response = requests.post(f"{BASE_URL}/customers", json=customer_data)
    if customer_response.status_code != 200:
        print(f"❌ Setup failed: Customer creation - {customer_response.status_code}")
        return False
    
    customer_id = customer_response.json()["id"]
    print(f"✅ Setup: Customer created (ID: {customer_id})")
    
    project_data = {
        "customer_id": customer_id,
        "name": "PUT Test Projekt",
        "description": "Test project for PUT endpoint validation",
        "status": "active"
    }
    
    project_response = requests.post(f"{BASE_URL}/projects", json=project_data)
    if project_response.status_code != 200:
        print(f"❌ Setup failed: Project creation - {project_response.status_code}")
        return False
    
    project_id = project_response.json()["id"]
    print(f"✅ Setup: Project created (ID: {project_id})")
    
    # Test 1: Create initial photo with annotations
    print("\n1️⃣ Creating initial photo with annotations...")
    initial_annotations = json.dumps({
        "annotations": [
            {"type": "arrow", "x": 100, "y": 150, "text": "Beschädigter Ziegel"},
            {"type": "circle", "x": 200, "y": 250, "radius": 30, "text": "Riss im Dach"}
        ],
        "version": "1.0",
        "created_by": "PUT Test User"
    })
    
    photo_data = {
        "project_id": project_id,
        "image_data": create_test_image_data(),
        "annotations": initial_annotations,
        "description": "Dachschäden Nordseite - Erstaufnahme"
    }
    
    photo_response = requests.post(f"{BASE_URL}/photos", json=photo_data)
    if photo_response.status_code != 200:
        print(f"❌ Photo creation failed: {photo_response.status_code} - {photo_response.text}")
        return False
    
    photo = photo_response.json()
    photo_id = photo["id"]
    original_photo_id = photo_id
    print(f"✅ Photo created successfully (ID: {photo_id})")
    print(f"   Description: {photo['description']}")
    print(f"   Annotations: {len(json.loads(photo['annotations'])['annotations'])} items")
    
    # Test 2: Update photo using PUT endpoint
    print(f"\n2️⃣ 🎯 TESTING PUT /api/photos/{photo_id}")
    updated_annotations = json.dumps({
        "annotations": [
            {"type": "arrow", "x": 100, "y": 150, "text": "Beschädigter Ziegel - REPARIERT"},
            {"type": "circle", "x": 200, "y": 250, "radius": 30, "text": "Riss im Dach - VERSIEGELT"},
            {"type": "rectangle", "x": 300, "y": 100, "width": 50, "height": 30, "text": "Neue Markierung"},
            {"type": "text", "x": 400, "y": 200, "text": "Qualitätskontrolle OK"}
        ],
        "version": "2.0",
        "updated_by": "PUT Test User",
        "update_date": datetime.now().isoformat(),
        "changes": ["Added new markings", "Updated repair status"]
    })
    
    updated_photo_data = {
        "project_id": project_id,
        "image_data": create_test_image_data(),
        "annotations": updated_annotations,
        "description": "Dachschäden Nordseite - Nach Reparatur und Qualitätskontrolle"
    }
    
    put_response = requests.put(f"{BASE_URL}/photos/{photo_id}", json=updated_photo_data)
    
    # Validate PUT response
    if put_response.status_code != 200:
        print(f"❌ PUT request failed: {put_response.status_code} - {put_response.text}")
        return False
    
    updated_photo = put_response.json()
    updated_photo_id = updated_photo["id"]
    
    print(f"✅ PUT endpoint returned 200 OK")
    print(f"   Response time: {put_response.elapsed.total_seconds():.3f}s")
    
    # Test 3: Verify Photo ID persistence (CRITICAL REQUIREMENT)
    print("\n3️⃣ Verifying Photo ID persistence...")
    print(f"   Original Photo ID: {original_photo_id}")
    print(f"   Updated Photo ID:  {updated_photo_id}")
    
    if original_photo_id == updated_photo_id:
        print("✅ CRITICAL: Photo ID remained the same after PUT update")
    else:
        print(f"❌ CRITICAL FAILURE: Photo ID changed during PUT update!")
        print(f"   This breaks the requirement that ID must persist")
        return False
    
    # Test 4: Verify annotations were correctly saved (CRITICAL REQUIREMENT)
    print("\n4️⃣ Verifying annotations update...")
    try:
        updated_annotations_obj = json.loads(updated_photo["annotations"])
        
        # Check annotation count
        annotation_count = len(updated_annotations_obj["annotations"])
        if annotation_count == 4:
            print(f"✅ Annotations count correct: {annotation_count} items")
        else:
            print(f"❌ Expected 4 annotations, got {annotation_count}")
            return False
        
        # Check version update
        if updated_annotations_obj["version"] == "2.0":
            print("✅ Annotations version updated correctly (1.0 → 2.0)")
        else:
            print(f"❌ Version not updated correctly: {updated_annotations_obj.get('version')}")
            return False
        
        # Check specific annotation updates
        repair_found = False
        new_marking_found = False
        for annotation in updated_annotations_obj["annotations"]:
            if "REPARIERT" in annotation.get("text", ""):
                repair_found = True
            if "Neue Markierung" in annotation.get("text", ""):
                new_marking_found = True
        
        if repair_found and new_marking_found:
            print("✅ Specific annotation updates verified")
        else:
            print(f"❌ Annotation content not updated properly")
            return False
            
        print("✅ CRITICAL: Annotations correctly saved and updated")
    except Exception as e:
        print(f"❌ Error parsing annotations: {e}")
        return False
    
    # Test 5: Verify description update
    print("\n5️⃣ Verifying description update...")
    expected_description = "Dachschäden Nordseite - Nach Reparatur und Qualitätskontrolle"
    if updated_photo.get("description") == expected_description:
        print("✅ Description updated correctly")
    else:
        print(f"❌ Description not updated. Expected: {expected_description}")
        print(f"   Got: {updated_photo.get('description')}")
        return False
    
    # Test 6: Verify GET endpoint returns updated data
    print("\n6️⃣ Verifying GET endpoint returns updated photo...")
    get_response = requests.get(f"{BASE_URL}/photos/project/{project_id}")
    if get_response.status_code != 200:
        print(f"❌ GET photos failed: {get_response.status_code}")
        return False
    
    photos = get_response.json()
    if len(photos) == 1 and photos[0]["id"] == photo_id:
        retrieved_photo = photos[0]
        if retrieved_photo["description"] == expected_description:
            print("✅ GET endpoint returns updated photo data")
        else:
            print("❌ GET endpoint returns stale data")
            return False
    else:
        print(f"❌ GET endpoint issue. Expected 1 photo, got {len(photos)}")
        return False
    
    # Test 7: Test DELETE with correct ID (CRITICAL REQUIREMENT)
    print(f"\n7️⃣ Testing DELETE with photo ID: {photo_id}")
    delete_response = requests.delete(f"{BASE_URL}/photos/{photo_id}")
    if delete_response.status_code != 200:
        print(f"❌ DELETE failed: {delete_response.status_code} - {delete_response.text}")
        return False
    
    print("✅ CRITICAL: DELETE works with correct photo ID")
    
    # Test 8: Verify photo is actually deleted
    print("\n8️⃣ Verifying photo deletion...")
    verify_response = requests.get(f"{BASE_URL}/photos/project/{project_id}")
    if verify_response.status_code == 200:
        remaining_photos = verify_response.json()
        if len(remaining_photos) == 0:
            print("✅ Photo successfully removed from project")
        else:
            print(f"❌ Photo still exists! Found {len(remaining_photos)} photos")
            return False
    
    # Cleanup
    print("\n🧹 Cleaning up test data...")
    requests.delete(f"{BASE_URL}/projects/{project_id}")
    requests.delete(f"{BASE_URL}/customers/{customer_id}")
    print("✅ Test data cleaned up")
    
    return True

def main():
    """Run the focused Photo PUT endpoint test"""
    print("🚀 PHOTO PUT ENDPOINT VALIDATION")
    print("Testing newly implemented PUT /api/photos/{photo_id}")
    print("=" * 50)
    
    # Test backend connectivity
    try:
        print("🔗 Testing backend connectivity...")
        health_response = requests.get(f"{BASE_URL}/customers", timeout=10)
        if health_response.status_code == 200:
            print("✅ Backend is accessible")
        else:
            print(f"⚠️ Backend responded with status {health_response.status_code}")
    except Exception as e:
        print(f"❌ Backend connectivity failed: {e}")
        return False
    
    # Run focused PUT test
    success = test_photo_put_endpoint_focused()
    
    print("\n" + "=" * 50)
    print("📋 TEST RESULTS SUMMARY")
    print("=" * 50)
    
    if success:
        print("🎉 ALL PHOTO PUT TESTS PASSED!")
        print()
        print("✅ PUT /api/photos/{photo_id} endpoint working correctly")
        print("✅ Photo ID persistence verified (CRITICAL REQUIREMENT)")
        print("✅ Annotations update functionality confirmed (CRITICAL REQUIREMENT)")
        print("✅ DELETE functionality working with correct ID (CRITICAL REQUIREMENT)")
        print("✅ PUT endpoint returns 200 status code")
        print("✅ GET endpoint returns updated data")
        print("✅ Description updates working")
        print()
        print("🎯 CONCLUSION: The newly implemented PUT endpoint meets all requirements")
    else:
        print("❌ PHOTO PUT TESTS FAILED!")
        print("⚠️ PUT endpoint or related functionality has critical issues")
        print("🔧 Review the failed test output above for specific issues")
    
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)