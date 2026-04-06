const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
// const Cart = require('../models/Cart');
// const Book = require('../models/Book');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../config/email');
const { validate } = require('../middleware/validate');
const { userSchemas } = require('../validation/schemas');

// Register
router.post('/register', 
  validate(userSchemas.register),
  async (req, res) => {
    console.log("hii");
    
    console.log(req.body);
    
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const user = new User({
        ...req.body,
        verificationToken,
        isVerified: false
      });
      await user.save();
      await sendVerificationEmail(user.email, verificationToken);
      const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET);
      res.status(201).json({ user, token, message: 'Verification email sent' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Login
router.post('/login',
  validate(userSchemas.login),
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (!user) throw new Error('User not found');

      if (!user.isVerified) {
        throw new Error('Please verify your email first');
      }
      if(!user.isActive) {
        throw new Error('Your account is inactive, Please Contact Support');
      }

      const isMatch = await bcrypt.compare(req.body.password, user.password);
      if (!isMatch) throw new Error('Invalid credentials');

      const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET);
      res.json({ user, token });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Email verification
router.get('/verify/:token', async (req, res) => {
  console.log( req.params.token);
  
  try {
    const user = await User.findOne({ verificationToken: req.params.token});
    console.log(user);
    
    if (!user) {
      console.log("not");
      return res.status(400).json({ message: 'Invalid verification token' });
      
      
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.log("hello");
    
  }
});

// Change forgot password route
router.post('/auth/forgot-password', async (req, res) => {
 console.log(req.body);
  
  try {
    const {email} = req.body;
    console.log(email);
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 600000; // 10 minutes
    await user.save();

    await sendPasswordResetEmail(user.email, resetToken);
    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update reset password route
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Your password reset session has expired. Please request a new one' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update email verification route
router.post('/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's cart
router.get('/cart', auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate('items.book');
    if (cart) {
      cart.items = cart.items.filter(item => item.book !== null);
      await cart.save();
      await cart.populate('items.book');
    }
    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
      await cart.save();
    }
    res.json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add to cart
router.post('/cart', auth, async (req, res) => {
  try {
    const { bookId, quantity } = req.body;
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    const existingItem = cart.items.find(item => item.book.toString() === bookId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({ book: bookId, quantity });
    }

    await cart.save();
    await cart.populate('items.book');
    res.json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update cart item quantity
router.patch('/cart/:itemId', auth, async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    
    if (isNaN(quantity)) {
      return res.status(400).json({ message: 'Invalid quantity value' });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => 
      item._id.toString() === req.params.itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();
    await cart.populate('items.book');
    res.json(cart);
  } catch (error) {
    console.error('Cart update error:', error);
    res.status(400).json({ message: 'Failed to update cart item' });
  }
});

// Remove item from cart
router.delete('/cart/:itemId', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => 
      item._id.toString() === req.params.itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();
    await cart.populate('items.book');
    res.json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}
);

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update user profile
router.patch('/profile',
  auth,
  validate(userSchemas.updateProfile),
  async (req, res) => {
    console.log(req.body);
    
    try {
      const user = await User.findById(req.user.id);
      if (req.body.name) user.name = req.body.name;
      if (req.body.email) user.email = req.body.email;
      if (req.body.gender) user.gender = req.body.gender;
      if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;
      if (req.body.phone) user.phone = req.body.phone;

      await user.save();
      
      const userWithoutPassword = user.toObject();
      delete userWithoutPassword.password;
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

// Update password
router.patch('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update shipping address
router.patch('/address', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.address = req.body;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Clear cart
router.delete('/cart', auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get favorite books
router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('favorites');
    res.json(user.favorites || []);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add/Remove favorite book
router.post('/favorites/:bookId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const bookId = req.params.bookId;
    
    const index = user.favorites ? user.favorites.indexOf(bookId) : -1;
    if (index > -1) {
      user.favorites.splice(index, 1);
    } else {
      if (!user.favorites) user.favorites = [];
      user.favorites.push(bookId);
    }
    
    await user.save();
    await user.populate('favorites');
    res.json(user.favorites);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add new address
router.post('/addresses', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Adjust required fields to match frontend
    const requiredFields = ['mobilenum','addl1','addl2','pincode', 'city', 'state'];
    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].trim() === "") {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    // Set first address as default
    const isFirstAddress = user.addresses.length === 0;
    user.addresses.push({
      ...req.body,
      isDefault: isFirstAddress
    });

    await user.save();
    res.json(user.addresses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all addresses
router.get('/addresses', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user.addresses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update address
router.patch('/addresses/:addressId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const address = user.addresses.id(req.params.addressId);
    
    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // Ensure contact number is present
    if (!req.body.contactNumber && !address.contactNumber) {
      return res.status(400).json({ message: 'Contact number is required' });
    }

    // Update address fields while preserving existing values
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && req.body[key] !== '') {
        address[key] = req.body[key];
      }
    });

    await user.save();
    res.json(address);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete address
router.delete('/addresses/:addressId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.addresses.pull(req.params.addressId);
    await user.save();
    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Set default address
router.post('/addresses/:addressId/default', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    await user.setDefaultAddress(req.params.addressId);
    res.json(user.addresses);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update user preferences
router.patch('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.preferences = {
      ...user.preferences,
      ...req.body
    };
    await user.save();
    res.json(user.preferences);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get user preferences
router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user.preferences);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
