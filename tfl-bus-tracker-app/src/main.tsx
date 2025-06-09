import React, { useState } from 'react';
import axios from 'axios';
import './styles/global.css';

const SearchBar = ({ onSearch }) => {
    const [query, setQuery] = useState('');

    const handleSearch = async () => {
        const response = await axios.get(`https://api.tfl.gov.uk/StopPoint/Search/${query}`);
        onSearch(response.data);
    };

    return (
        <div>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for bus stops..."
            />
            <button onClick={handleSearch}>Search</button>
        </div>
    );
};

export default SearchBar;