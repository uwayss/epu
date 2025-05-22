# FILE: scripts/relgen.py
import subprocess
import os
import re
# Removed argparse import
import sys
from google import generativeai as genai

# --- Constants ---
GRADLE_FILE_PATH = os.path.join("android", "app", "build.gradle")
LANG_TAG_EN = "<en-US>"
LANG_TAG_AR = "<ar>"
LANG_TAG_TR = "<tr-TR>"
LANG_TAG_END_SUFFIX = "</"
DEFAULT_NUM_COMMITS = 5 # Default value if user enters nothing or invalid input
LATEST_RELEASE_NOTE_FILE = "latest-release-note.txt" # Output file name

# --- Helper Functions ---

def get_api_key():
    """Retrieves the Gemini API key from environment variables."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.", file=sys.stderr)
        print("Please set this environment variable with your Google Gemini API key.", file=sys.stderr)
        sys.exit(1)
    return api_key

def get_last_commits(n: int) -> list[str]:
    """Gets the subject lines of the last n git commits."""
    if n <= 0:
        print("Error: Number of commits must be positive.", file=sys.stderr)
        return []
    try:
        result = subprocess.run(
            ["git", "log", f"-{n}", "--pretty=format:%s"],
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8' # Explicitly set encoding
        )
        commits = result.stdout.strip().split("\n")
        commits = [commit for commit in commits if commit.strip()] # Ensure commits are not just whitespace
        if not commits:
             print("Warning: No non-empty commit messages found for the last {} commits.".format(n), file=sys.stderr)
             return []
        print(f"Fetched {len(commits)} commit messages.")
        return commits
    except FileNotFoundError:
        print("Error: 'git' command not found. Make sure Git is installed and in your PATH.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error running git log: {e}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        print("Are you in a git repository? Do you have any commits?", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred while fetching commits: {e}", file=sys.stderr)
        sys.exit(1)


def increment_version_code(file_path: str) -> int:
    """Increments the versionCode in the specified build.gradle file."""
    if not os.path.exists(file_path):
        print(f"Error: Gradle file not found at {file_path}", file=sys.stderr)
        print("Please ensure you are running this script from the root of your Expo/React Native project.", file=sys.stderr)
        sys.exit(1)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        pattern = r'(\bversionCode\s+(?:=)?\s*)(\d+)' # Made = optional, added optional space
        match = re.search(pattern, content)

        if not match:
            print(f"Error: Could not find 'versionCode' in {file_path}", file=sys.stderr)
            print("Ensure your android/app/build.gradle file has a versionCode line (e.g., versionCode 1).", file=sys.stderr)
            sys.exit(1)

        current_version_code = int(match.group(2))
        new_version_code = current_version_code + 1

        new_content = re.sub(pattern, rf'\g<1>{new_version_code}', content, count=1)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        print(f"Incremented versionCode in {file_path} from {current_version_code} to {new_version_code}")
        return new_version_code

    except FileNotFoundError: # Should be caught by os.path.exists, but good to have
        print(f"Error: Gradle file not found at {file_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error processing gradle file {file_path}: {e}", file=sys.stderr)
        sys.exit(1)

def generate_content_with_gemini(prompt: str, api_key: str) -> str:
    """Generates content using the Gemini API. Assumes genai is configured."""
    try:
        # Genai should be configured in main or once globally
        model = genai.GenerativeModel('gemini-1.5-flash-latest') # Using 1.5 flash
        response = model.generate_content(prompt)

        text_content = None
        try:
            if response.text: # Prioritize .text if available
                 text_content = response.text.strip()
        except ValueError: # .text can raise ValueError if content is blocked
             print("Warning: Accessing response.text failed (possibly due to content blocking). Checking candidates.", file=sys.stderr)
        except AttributeError: # If response object doesn't have .text
             print("Warning: response.text attribute not found. Checking candidates.", file=sys.stderr)


        if text_content is None and response.candidates:
             if response.candidates[0].content and response.candidates[0].content.parts:
                 text_content = "".join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text')).strip()


        if text_content is None:
             print("Error: Could not extract text from Gemini response.", file=sys.stderr)
             if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                 print(f"Prompt Feedback: {response.prompt_feedback}", file=sys.stderr)
             if hasattr(response, 'candidates') and response.candidates and hasattr(response.candidates[0], 'finish_reason'):
                 print(f"Finish Reason: {response.candidates[0].finish_reason}", file=sys.stderr)
                 if hasattr(response.candidates[0], 'safety_ratings'):
                      print(f"Safety Ratings: {response.candidates[0].safety_ratings}", file=sys.stderr)
             return ""
        else:
             return text_content

    except Exception as e:
        print(f"Error during Gemini API call: {e}", file=sys.stderr)
        # You might want to print more details from 'e' if it's a specific API error type
        return ""

def generate_and_translate_notes(commits: list[str], api_key: str) -> dict[str, str]:
    """Generates and translates release notes in a single API call."""
    commit_list_str = "\n".join(f"- {commit}" for commit in commits) # Use \n for newlines in prompt

    prompt = f"""Analyze the following recent git commit messages and perform the tasks below:

Commit Messages:
{commit_list_str}

Tasks:
1.  Generate a user-friendly release note summary in English, suitable for the Google Play Store.
    - Keep it concise and easy for non-technical users to understand.
    - Focus on the user-visible changes or improvements.
    - Use very few emojis, if any.
    - Do NOT use any markdown formatting (like *, -, #) or HTML tags in the content of the notes.
    - Each note should be a paragraph of text.
2.  Translate the generated English release note into Arabic.
3.  Translate the generated English release note into Turkish.
4.  Format the output *exactly* as follows, including the language tags, with each note on its own set of lines:
    {LANG_TAG_EN}
    [English release note here]
    {LANG_TAG_EN.replace('<','</')}
    {LANG_TAG_AR}
    [Arabic translation here]
    {LANG_TAG_AR.replace('<','</')}
    {LANG_TAG_TR}
    [Turkish translation here]
    {LANG_TAG_TR.replace('<','</')}

Output only the formatted notes with the tags. Do not include any other text, explanations, or markdown before or after this structure.
"""
    print("\nGenerating and translating release notes (single API call to Gemini)...")
    full_response = generate_content_with_gemini(prompt, api_key)

    if not full_response:
        print("Error: Failed to get a valid response from Gemini.", file=sys.stderr)
        return {}

    notes = {}
    try:
        # Regex to find content within tags, handling potential whitespace/newlines
        # Using re.DOTALL so '.' matches newlines. Using non-greedy '.*?'
        en_match = re.search(rf'{re.escape(LANG_TAG_EN)}(.*?){re.escape(LANG_TAG_EN.replace("<","</"))}', full_response, re.DOTALL)
        ar_match = re.search(rf'{re.escape(LANG_TAG_AR)}(.*?){re.escape(LANG_TAG_AR.replace("<","</"))}', full_response, re.DOTALL)
        tr_match = re.search(rf'{re.escape(LANG_TAG_TR)}(.*?){re.escape(LANG_TAG_TR.replace("<","</"))}', full_response, re.DOTALL)

        if en_match:
            notes['en'] = en_match.group(1).strip()
        else:
             print(f"Warning: Could not parse English note ({LANG_TAG_EN}) from Gemini response.", file=sys.stderr)

        if ar_match:
            notes['ar'] = ar_match.group(1).strip()
        else:
            print(f"Warning: Could not parse Arabic note ({LANG_TAG_AR}) from Gemini response.", file=sys.stderr)

        if tr_match:
            notes['tr'] = tr_match.group(1).strip()
        else:
             print(f"Warning: Could not parse Turkish note ({LANG_TAG_TR}) from Gemini response.", file=sys.stderr)

    except Exception as e:
        print(f"Error parsing Gemini response: {e}", file=sys.stderr)
        print("--- Raw Gemini Response ---", file=sys.stderr)
        print(full_response, file=sys.stderr)
        print("---------------------------", file=sys.stderr)
        # Return what we have, even if partial, or empty if critical
        return notes

    if 'en' not in notes or not notes['en']:
         print("Error: Failed to extract mandatory English note from Gemini response.", file=sys.stderr)
         print("--- Raw Gemini Response ---", file=sys.stderr)
         print(full_response, file=sys.stderr)
         print("---------------------------", file=sys.stderr)
         return {} # English note is critical

    return notes

def get_commit_count_from_user() -> int:
    """Prompts the user for the number of commits and validates the input."""
    while True:
        try:
            user_input = input(f"Enter the number of last commits to use for release notes (default: {DEFAULT_NUM_COMMITS}): ")
            if not user_input:
                return DEFAULT_NUM_COMMITS
            num_commits = int(user_input)
            if num_commits > 0 and num_commits < 50: # Added an upper sanity limit
                return num_commits
            else:
                print("Please enter a positive number (e.g., 1-49).")
        except ValueError:
            print("Invalid input. Please enter a whole number.")
        except EOFError:
             print("\nInput cancelled. Exiting.")
             sys.exit(1) # Exit if input is cancelled


# --- Main Execution ---

def main():
    print("--- Release Note Generator (relgen.py) ---")
    api_key = get_api_key()
    try:
         genai.configure(api_key=api_key)
         print("Gemini API configured.")
    except Exception as e:
         print(f"Error configuring Gemini API: {e}", file=sys.stderr)
         sys.exit(1)

    num_commits = get_commit_count_from_user()

    commits = get_last_commits(num_commits)

    if not commits:
        print("No commit messages found or fetched. Cannot generate release notes. Exiting.", file=sys.stderr)
        sys.exit(1)

    increment_version_code(GRADLE_FILE_PATH) # This is android/app/build.gradle

    notes = generate_and_translate_notes(commits, api_key)

    if not notes or 'en' not in notes or not notes['en']:
        print("Failed to generate essential release notes. Please check Gemini output/errors. Exiting.", file=sys.stderr)
        sys.exit(1)

    en_note = notes.get('en', "Error: English note missing.")
    # Fallback to English if translation is missing or failed
    ar_note = notes.get('ar', en_note if 'ar' not in notes else "Error: Arabic translation missing.")
    tr_note = notes.get('tr', en_note if 'tr' not in notes else "Error: Turkish translation missing.")


    if ar_note == en_note and 'ar' not in notes and 'en' in notes : # More specific warning
         print("Warning: Using English text as fallback for Arabic translation.", file=sys.stderr)
    if tr_note == en_note and 'tr' not in notes and 'en' in notes:
         print("Warning: Using English text as fallback for Turkish translation.", file=sys.stderr)

    # Prepare the final output string
    output_string_parts = [
        LANG_TAG_EN, en_note, LANG_TAG_EN.replace('<','</'),
        LANG_TAG_AR, ar_note, LANG_TAG_AR.replace('<','</'),
        LANG_TAG_TR, tr_note, LANG_TAG_TR.replace('<','</')
    ]
    final_output_string = '\n'.join(output_string_parts)

    try:
        with open(LATEST_RELEASE_NOTE_FILE, 'w', encoding='utf-8') as file:
            file.write(final_output_string)
        print(f"\n✅ Release notes successfully written to ./{LATEST_RELEASE_NOTE_FILE}")
    except IOError as e:
        print(f"Error writing release notes to file ./{LATEST_RELEASE_NOTE_FILE}: {e}", file=sys.stderr)


    print("\n--- Play Store Release Notes (also saved to {}) ---".format(LATEST_RELEASE_NOTE_FILE))
    print(final_output_string)
    print("----------------------------------------------------")
    print("Process completed.")


if __name__ == "__main__":
    main()
